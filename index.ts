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

import { MongoClient } from 'mongodb';
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
  if(!authHeader || !authHeader.startsWith('Bearer')){
    return res.status(401).json({message : "Unauthorize"});
  }

  const token = authHeader.split(" ")[1];
  
  if(!token){
    return res.status(401).json({message : "Unauthorize"});
  }

  try{
    const {payload} = await jwtVerify(token, JWKS);
    // console.log(payload);
    // req.user = payload;
    (req as any).user = payload;    
    next();
  }catch(error){
    // console.log(error)
    return res.status(401).json({message : "Unauthorize"});
  }
}

// Organizer verify
const organizerVerify = async(req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;

  
  if(user?.role !== "organizer"){
    return res.status(403).json({message : "Forbidden"});
  }

  next();
};
// User verify
const userVerify = async(req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;
  if(user?.role !== "user"){
    return res.status(403).send({message : "Forbidden access"})
  }

  next();
}
// Admin verify
const adminVerify = async(req: Request,
  res: Response,
  next: NextFunction) => {
  const user = (req as AuthRequest).user;
  if(user?.role !== "admin"){
    return res.status(403).send({message : "Forbidden access"})
  }

  next();
}

export async function connectToMongoDB() {
  try {
    await client.connect();
    const db = client.db("confluxa_db");
    const userCollection = db.collection("user");
    const eventCollection = db.collection("event");

    app.get('/users',async(req,res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();

      res.json(result)
    });

    app.post('/events', verifyToken, organizerVerify, async(req,res) => {
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
    app.get('/event', async (req, res) => {
      const result = await eventCollection.find().toArray();
      res.json(result);
    });
    
    // get public ticket 
    // app.get('/event', async (req, res) => {
    //   const query = {
    //       status: "approved",
    //       hidden: { $ne: true }
    //   }

    //   // from location 
    //   if(req.query.from){
    //     query.fromLocation = {
    //       $regex: req.query.from.trim(),
    //       $options: "i",
    //       // $regex: new RegExp(req.query.from.trim(), "i"),
    //     }
    //   }
    //   // to location 
    //   if(req.query.to){
    //     query.toLocation = {
    //       $regex: req.query.to.trim(),
    //       $options: "i",
    //     }
    //   }

    //   // transport filter
    //   if (
    //     req.query.transport &&
    //     req.query.transport !== "all"
    //   ) {
    //     query.transportType = req.query.transport;
    //   }

    //   let sortQuery = { createdAt: -1 };

    //   // sort by price
    //   if (req.query.sort === "low") {
    //     sortQuery = { pricePerUnit: 1};
    //   }

    //   if (req.query.sort === "high") {
    //     sortQuery = { pricePerUnit: -1};
    //   }
    //   // pagination

    //   // const page = req.query.page || 1;
    //   // const limit = req.query.limit || 6;
    //   const page = Number(req.query.page) || 1;
    //   const limit = Number(req.query.limit) || 9;

    //   const skip = (page - 1) * limit;

    //   const total = await ticketCollection.countDocuments(query);

    //   const tickets = await ticketCollection
    //     .find(query)
    //     .sort(sortQuery)
    //     .skip(skip)
    //     .limit(limit)
    //     .toArray();
    //   // convert string → number here
    // const formattedTickets = tickets.map(ticket => ({
    //   ...ticket,
    //   pricePerUnit: Number(ticket.pricePerUnit),
    //   ticketQuantity: Number(ticket.ticketQuantity),
    // }));
    //   // const result = await ticketCollection.find({  }).toArray();
    //   res.json({
    //     total,
    //     totalPages: Math.ceil(total / limit),
    //     currentPage: page,
    //     tickets: formattedTickets,
    //   });
    // });


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
// export default app;