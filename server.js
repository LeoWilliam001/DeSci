import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Pdf from "./models/Pdf.js"; // Import schema
import Campaign from "./models/Campaign.js"; // Import Campaign schema
import pdfParse from "pdf-parse";
import axios from "axios";


dotenv.config(); // Load environment variables from .env file
app.use(cors()); // Allow all origins (not secure)


const app = express();
const port = process.env.PORT || 5000; // Use environment variable for port or default to 5000


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));


// Configure CORS to allow requests from your frontend domain
const corsOptions = {
  origin: ["http://localhost:3000", process.env.FRONTEND_URI || ""],
  methods: "GET, HEAD, PUT, PATCH, POST, DELETE",
};


app.use(cors(corsOptions));
app.use(express.json());


// Get PDF data
app.get("/api/data", async (req, res) => {
  try {
    const data = await Pdf.find({}).select("_id filename contractAddress textContent uploadedAt");
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});


const contractAddress = "0x741be4559561ebFB37fa2d5277AB548BFb8a2C3f";


// Get PDFs by contract address
app.get("/api/data/contract/:contractAddress", async (req, res) => {
  try {
    const data = await Pdf.find({ contractAdd: contractAddress }).select("_id filename contractAddress");    
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});


// Configure Multer for file storage
const storage = multer.memoryStorage();
const upload = multer({ storage });


// Upload PDF API
app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  try {
    const pdfBuffer = req.file.buffer;
    const pdfData = await pdfParse(pdfBuffer);
    let textContent = pdfData.text.replace(/\W+/g, " ").trim();


    if (!textContent) {
      throw new Error("Failed to extract text content from PDF");
    }


    const response = await axios.post(
      "https://api.mistral.ai/v1/embeddings",
      {
        input: [textContent],
        model: "mistral-embed",
        encoding_format: "float",
      },
      {
        headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      }
    );


    const embeddings = response.data.data[0].embedding;


    const similarDocs = await Pdf.aggregate([
      {
        $search: {
          index: "pdf_index",
          knnBeta: { vector: embeddings, path: "embeddings", k: 5 },
        },
      },
      { $project: { filename: 1, similarity: { $meta: "searchScore" } } },
    ]);


    const duplicateDoc = similarDocs.find(doc => doc.similarity > 0.95);
    if (duplicateDoc) {
      return res.status(400).json({ message: "Duplicate PDF detected!", similarTo: duplicateDoc });
    }


    const newPdf = new Pdf({
      filename: req.file.originalname,
      contractAdd: contractAddress,
      fileUrl: `/uploads/${req.file.filename}`,
      textContent,
      embeddings,
    });


    await newPdf.save();
    res.json({ message: "PDF uploaded successfully!", file: newPdf });
  } catch (error) {
    console.error("Error uploading and processing file:", error);
    res.status(500).json({ error: "Error uploading and processing file" });
  }
});


// Store a new campaign in MongoDB
app.post("/api/campaigns", async (req, res) => {
  try {
    const { paperId, campaignId, goal, walletAddress } = req.body;
    const newCampaign = new Campaign({ paperId, campaignId, goal, walletAddress });
    await newCampaign.save();
    res.status(201).json({ message: "Campaign stored successfully!" });
  } catch (error) {
    console.error("Error saving campaign:", error);
    res.status(500).json({ message: "Error storing campaign" });
  }
});


// Fetch all campaigns
app.get("/api/campaigns", async (req, res) => {
  try {
    const campaigns = await Campaign.find();
    res.json(campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ message: "Error fetching campaigns" });
  }
});


app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});


export default app;



