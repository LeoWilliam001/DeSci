import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  paperId: { type: String, required: true },
  campaignId: { type: String, required: true, unique: true },
  goal: { type: String, required: true },
  walletAddress: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model("Campaign", CampaignSchema);
