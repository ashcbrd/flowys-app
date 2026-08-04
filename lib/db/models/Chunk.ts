import mongoose, { Schema, Model } from "mongoose";
import { v4 as uuid } from "uuid";

export interface IChunk {
  _id: string;
  workspaceId: string;
  knowledgeBaseId: string;
  documentId: string;
  ord: number;
  text: string;
  embedding: number[];
  tokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const ChunkSchema = new Schema<IChunk>(
  {
    _id: { type: String, default: () => uuid() },
    workspaceId: { type: String, required: true, index: true },
    knowledgeBaseId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, index: true },
    ord: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    tokens: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
);

// The Atlas Vector Search index on `embedding` is created out of band
// (Atlas API/UI) in the Retrieval Core sub-project, not here.

export const Chunk: Model<IChunk> =
  mongoose.models.Chunk || mongoose.model<IChunk>("Chunk", ChunkSchema);
