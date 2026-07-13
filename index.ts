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
  
  if(!authHeader || !authHeader.startsWith('Bearer')){
    return res.status(401).json({message : "Unauthorize"});
  }

  const token = authHeader.split(" ")[1];
  
  if(!token){
    return res.status(401).json({message : "Unauthorize"});
  }

  try{
    const {payload} = await jwtVerify(token, JWKS);
    console.log(payload);
    // req.user = payload;
    
    next();
  }catch(error){
    return res.status(401).json({message : "Unauthorize"});
  }
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

    app.post('/events', verifyToken, async(req,res) => {
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
export default app;