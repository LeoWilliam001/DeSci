// filepath: [index.js](http://_vscodecontentref_/5)
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import server from "./server.js"; // Import server.js

dotenv.config(); // Load environment variables from .env file

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

app.use("/", server); // Use server.js for handling routes

export default app; // Export app for server.js