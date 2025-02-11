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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB", err));

// Configure CORS to allow requests from your frontend domain
const allowedOrigins = [
  process.env.FRONTEND_URL, // Local development URL
  `http://${require('os').networkInterfaces().eth0[0].address}:3000` // Network URL for local development
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Configure Multer for file storage
const storage = multer.memoryStorage(); // Use memory storage to get the file buffer directly
const upload = multer({ storage });

// Upload PDF API
app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  try {
    const pdfBuffer = req.file.buffer;
    console.log("PDF Buffer:", pdfBuffer);

    const pdfData = await pdfParse(pdfBuffer);
    console.log("PDF Data:", pdfData);

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
    console.log("Embeddings:", embeddings);

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
    const duplicateDoc = similarDocs.find(doc => doc.similarity > 0.85);

    if (duplicateDoc) {
      console.log("Duplicate PDF detected:", duplicateDoc);
      return res.status(400).json({ message: "Duplicate PDF detected!", similarTo: duplicateDoc });
    }

    // Save new PDF
    const newPdf = new Pdf({
      filename: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`, // Store file path
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