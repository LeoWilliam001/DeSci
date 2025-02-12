import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Pdf from "./models/Pdf.js"; // Import schema
import pdfParse from "pdf-parse";
import axios from "axios";

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000; // Use environment variable for port or default to 5000
// localStorage.setItem('contractAdd', "0x741be4559561ebFB37fa2d5277AB548BFb8a2C3f");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

// Configure CORS to allow requests from your frontend domain
const corsOptions = {
  origin: ["http://localhost:3000",process.env.FRONTEND_URI||""],
  methods: 'GET, HEAD, PUT, PATCH, POST, DELETE',
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/data", async (req, res) => {
  try {
    const data = await Pdf.find({});
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
const contractAddress = "0x741be4559561ebFB37fa2d5277AB548BFb8a2C3f";
app.get("/api/data/contract/:contractAddress", async (req, res) => {
  try {
    // const data = await Pdf.find({ contractAdd: localStorage.getItem('contractAdd') });
    const data = await Pdf.find({ contractAdd: contractAddress });    
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});
// Configure Multer for file storage
const storage = multer.memoryStorage(); // Use memory storage to get the file buffer directly
const upload = multer({ storage });

// Upload PDF API
app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  try {
    const pdfBuffer = req.file.buffer;
    console.log("PDF Buffer:", pdfBuffer);

    const pdfData = await pdfParse(pdfBuffer);
    // console.log("PDF Data:", pdfData);

    // Extract text content from pageData
    let textContent = pdfData.pageData.join(" ").trim();
    textContent = textContent.replace(/[\W_]+/g, " ").trim();
    console.log("Cleaned Text Content:", textContent);

    if (!textContent) {
      throw new Error("Failed to extract text content from PDF");
    }

    // Convert text content to embeddings using Mistral AI API
    const response = await axios.post(
      "https://api.mistral.ai/v1/embeddings",
      {
        input: [textContent],
        model: "mistral-embed",
        encoding_format: "float",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
      }
    );

    const embeddings = response.data.data[0].embedding;
    // console.log("Embeddings:", embeddings);

    // Perform a vector search to find similar documents
    const similarDocs = await Pdf.aggregate([
      {
        $search: {
          index: "pdf_index", // Ensure you have created an index for embeddings
          knnBeta: {
            vector: embeddings,
            path: "embeddings",
            k: 5,
          },
        },
      },
      {
        $project: {
          filename: 1,
          similarity: { $meta: "searchScore" },
        },
      },
    ]);

    console.log("Similar Docs:", similarDocs);

    // Check if any similar document has a similarity score above 0.85
    const duplicateDoc = similarDocs.find(doc => doc.similarity > 0.95);

    if (duplicateDoc) {
      console.log("Duplicate PDF detected:", duplicateDoc);
      return res.status(400).json({ message: "Duplicate PDF detected!", similarTo: duplicateDoc });
    }
    // localStorage.setItem('contractAdd', req.body.contractAdd);
    // console.log("Contract Address:", localStorage.getItem('contractAdd'));
    const newPdf = new Pdf({
      filename: req.file.originalname,
      contractAdd: contractAddress,
      fileUrl: `/uploads/${req.file.filename}`, 
      textContent: textContent,
      embeddings: embeddings,
    });

    await newPdf.save();
    res.json({ message: "PDF uploaded and processed successfully!", file: newPdf });
  } catch (error) {
    console.error("Error uploading and processing file:", error); // Log the error details
    res.status(500).json({ error: "Error uploading and processing file" });
  }
});

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});

export default app;