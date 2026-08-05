// Create the Atlas Search indexes retrieval depends on.
//
// These are not ordinary MongoDB indexes and `mongoose` will not create them
// from a schema. They are Atlas Search index definitions, managed through
// `createSearchIndex` on the driver.
//
// Two of them, because retrieval is hybrid:
//
//   knowledge_vector  — $vectorSearch over Chunk.embedding. `numDimensions`
//                       MUST equal EMBEDDING_DIMENSIONS in lib/knowledge/
//                       embeddings.ts. A mismatch does not error, it silently
//                       returns no matches.
//   knowledge_text    — $search over Chunk.text, for the keyword half. Semantic
//                       search alone misses exact terms: product codes, error
//                       strings, names.
//
// Both declare workspaceId and documentId as filter fields so the permission
// resolver's allow-list can be pushed into the query rather than applied after
// it. Filtering after ranking would return fewer than topK results whenever a
// user cannot see one of the winners.
//
// Idempotent: an index that already exists is left alone and reported.
//
//   node scripts/create-knowledge-indexes.mjs
//   node scripts/create-knowledge-indexes.mjs --drop   (recreate from scratch)
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

/** Must equal EMBEDDING_DIMENSIONS in lib/knowledge/embeddings.ts. */
const EMBEDDING_DIMENSIONS = 1536;

const VECTOR_INDEX = {
  name: "knowledge_vector",
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: EMBEDDING_DIMENSIONS,
        // Cosine, because text-embedding-3-small is not normalised to unit
        // length. dotProduct would rank longer chunks higher for no reason.
        similarity: "cosine",
      },
      { type: "filter", path: "workspaceId" },
      { type: "filter", path: "documentId" },
      { type: "filter", path: "knowledgeBaseId" },
    ],
  },
};

const TEXT_INDEX = {
  name: "knowledge_text",
  type: "search",
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        text: { type: "string" },
        workspaceId: { type: "token" },
        documentId: { type: "token" },
        knowledgeBaseId: { type: "token" },
      },
    },
  },
};

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

const drop = process.argv.includes("--drop");

const client = new MongoClient(uri);
await client.connect();

const chunks = client.db().collection("chunks");
const existing = await chunks.listSearchIndexes().toArray();
const byName = new Map(existing.map((i) => [i.name, i]));

for (const index of [VECTOR_INDEX, TEXT_INDEX]) {
  if (byName.has(index.name)) {
    if (!drop) {
      console.log(`${index.name}: already exists (${byName.get(index.name).status}); leaving as-is`);
      continue;
    }
    console.log(`${index.name}: dropping`);
    await chunks.dropSearchIndex(index.name);
    // A drop is not instant; wait for it to disappear before recreating.
    for (let i = 0; i < 60; i++) {
      const now = await chunks.listSearchIndexes().toArray();
      if (!now.some((x) => x.name === index.name)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await chunks.createSearchIndex(index);
  console.log(`${index.name}: created`);
}

// Building is asynchronous. Report the real state rather than assuming.
console.log("\nwaiting for indexes to finish building...");
for (let i = 0; i < 90; i++) {
  const now = await chunks.listSearchIndexes().toArray();
  const wanted = now.filter((x) => x.name === VECTOR_INDEX.name || x.name === TEXT_INDEX.name);
  const line = wanted.map((x) => `${x.name}=${x.status}`).join("  ");
  process.stdout.write(`\r  ${line}   `);
  if (wanted.length === 2 && wanted.every((x) => x.status === "READY")) break;
  if (wanted.some((x) => x.status === "FAILED")) break;
  await new Promise((r) => setTimeout(r, 2000));
}

const final = await chunks.listSearchIndexes().toArray();
console.log("\n");
for (const idx of final) {
  console.log(`${idx.name}  type=${idx.type}  status=${idx.status}  queryable=${idx.queryable}`);
}

await client.close();
