import mongoose from "mongoose";

const PdfSchema = new mongoose.Schema({
  filename: String,
  contractAdd: String,
  fileUrl: String,
  textContent: String,
  embeddings: { type: [Number], index: "vector" }, // Ensures embeddings are indexed
  uploadedAt: { type: Date, default: Date.now },
});

export default mongoose.model("Pdf", PdfSchema);
