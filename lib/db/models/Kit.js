import mongoose from "mongoose";

const PracticeRecordSchema = new mongoose.Schema(
  {
    flashcardId: { type: String, required: true },
    confidence: { type: Number, min: 1, max: 5, required: true },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const KitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inputJd: { type: String, required: true },
    inputCompanyUrl: { type: String, required: true },
    inputDays: { type: Number, required: true },
    dedupeHash: { type: String, required: true, index: true },

    // "generating" | "ready" | "failed"
    status: { type: String, default: "generating" },
    error: { type: mongoose.Schema.Types.Mixed, default: null },

    // The Appendix A structure, exactly. Stored loose (validated by zod on write) so we don't
    // have to hand-maintain a parallel mongoose schema for every LLM-shaped field.
    kit: { type: mongoose.Schema.Types.Mixed, default: null },

    practiceRecords: { type: [PracticeRecordSchema], default: [] },
  },
  { timestamps: true }
);

KitSchema.index({ userId: 1, dedupeHash: 1 });

export default mongoose.models.Kit || mongoose.model("Kit", KitSchema);
