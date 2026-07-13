import dns from "node:dns";

dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from "jose-cjs";
const client = new MongoClient(process.env.MONGODB_URI as string);

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

interface AuthRequest extends Request {
  user?: JWTPayload;
}

const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader)
  if (!authHeader || !authHeader.startsWith('Bearer')) {
    return res.status(401).json({ message: "Unauthorize" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorize" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    // console.log(payload);
    // req.user = payload;
    (req as any).user = payload;
    next();
  } catch (error) {
    // console.log(error)
    return res.status(401).json({ message: "Unauthorize" });
  }
}

// Organizer verify
const organizerVerify = async (req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;


  if (user?.role !== "organizer") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};
// User verify
const userVerify = async (req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;
  if (user?.role !== "user") {
    return res.status(403).send({ message: "Forbidden access" })
  }

  next();
}
// Admin verify
const adminVerify = async (req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;
  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" })
  }

  next();
}

export async function connectToMongoDB() {
  try {
    // await client.connect();
    const db = client.db("confluxa_db");
    const userCollection = db.collection("user");
    const eventCollection = db.collection("event");
    const bookingCollection = db.collection("bookings");

    app.get('/users', async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();

      res.json(result)
    });

    app.post('/events', verifyToken, organizerVerify, async (req, res) => {
      try {
        const data = req.body;

        const result = await eventCollection.insertOne({
          ...data,
          status: "pending",
          rating: 0,
          reviews: [],
          createdAt: new Date(),
        });

        res.json(result);

      } catch (error) {
        res.status(500).json({
          message: "Failed to create event",
          error,
        });
      }
    })
    // get public ticket 
    // app.get('/event', async (req, res) => {
    //   const result = await eventCollection.find().toArray();
    //   res.json(result);
    // });

    // get public event 
    app.get("/event", async (req, res) => {
      console.log("QUERY:", req.query);
      const query: any = {};

      // Only approved events
      // query.status = "approved";

      // Search by title
      if (req.query.search) {
        query.title = {
          $regex: req.query.search,
          $options: "i",
        };
      }
      console.log("MONGO QUERY:", query);

      // Category filter
      if (
        req.query.category &&
        req.query.category !== "all"
      ) {
        query.category = req.query.category;
      }

      // Date filter
      if (req.query.date) {
        query.date = req.query.date;
      }

      // Sorting
      let sortQuery: any = {
        createdAt: -1,
      };

      if (req.query.sort === "low") {
        sortQuery = {
          price: 1,
        };
      }

      if (req.query.sort === "high") {
        sortQuery = {
          price: -1,
        };
      }

      if (req.query.sort === "rating") {
        sortQuery = {
          rating: -1,
        };
      }

      // Pagination
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 9;

      const skip = (page - 1) * limit;

      const total = await eventCollection.countDocuments(query);

      const events = await eventCollection
        .find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .toArray();

      res.json({
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        events,
      });
    });

    // get event by id
    app.get("/event/:eventId", verifyToken, async (req, res) => {
      const { eventId } = req.params;

      if (!eventId || Array.isArray(eventId)) {
        return res.status(400).json({
          message: "Invalid event id",
        });
      }

      const result = await eventCollection.findOne({
        _id: new ObjectId(eventId),
      });

      if (!result) {
        return res.status(404).json({
          message: "Event not found",
        });
      }

      res.json(result);
    });

    // user
    app.post("/bookings", verifyToken, async (req, res) => {
      try {
        const user = (req as any).user;

        const { eventId } = req.body;

        if (!eventId) {
          return res.status(400).json({
            message: "Event id required",
          });
        }


        const existingBooking = await bookingCollection.findOne({
          eventId,
          userEmail: user.email,
        });


        if (existingBooking) {
          return res.status(400).json({
            message: "Already added",
          });
        }


        const booking = {
          eventId,
          userEmail: user.email,
          createdAt: new Date(),
        };


        const result = await bookingCollection.insertOne(booking);


        res.json({
          success: true,
          message: "Event added to dashboard",
          result,
        });


      } catch (error) {
        res.status(500).json({
          message: "Something went wrong",
        });
      }
    });

    app.get("/bookings", verifyToken, async(req,res)=>{

      const user = (req as any).user;


      const bookings = await bookingCollection
        .find({
          userEmail: user.email
        })
        .toArray();


      res.json(bookings);

    });

    // cancle
    // cancel booking
  app.delete("/bookings/:bookingId", verifyToken, async(
    req: Request<{bookingId:string}>,
    res
  )=>{

      const user = (req as any).user;

      const {bookingId}=req.params;


      const result = await bookingCollection.deleteOne({
        _id: new ObjectId(bookingId),
        userEmail:user.email
      });


      if(result.deletedCount===0){
        return res.status(404).json({
          message:"Booking not found"
        });
      }


      res.json({
        success:true,
        message:"Booking cancelled successfully"
      });

    });


    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
// Call this only when your application terminates
export async function disconnectFromMongoDB() {
  //   await client.close();
}

app.get("/", (req, res) => {
  res.send("Confluxa Server Running...");
});
connectToMongoDB();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
export default app;