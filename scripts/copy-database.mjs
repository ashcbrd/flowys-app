// Copy every collection from one database to another on the same cluster.
//
// Written for moving a deployment off the default `test` database, which is
// where writes land when a connection string names no database, but generic:
// nothing in here knows Flowys.
//
//   node scripts/copy-database.mjs --from test --to flowys-prod
//   node scripts/copy-database.mjs --from test --to flowys-prod --only users,workflows
//   node scripts/copy-database.mjs --from test --to flowys-prod --execute
//
// Dry-run by default: prints what it would copy and exits. `--execute` copies.
//
// Idempotent: existing documents are replaced by _id, so re-running after new
// writes landed in the source converges the target instead of duplicating.
// Ordinary indexes are recreated. Atlas Search indexes are NOT copied; create
// them with create-knowledge-indexes.mjs against the new database.
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const from = arg("from");
const to = arg("to");
const only = arg("only")?.split(",").map((s) => s.trim());
const execute = process.argv.includes("--execute");

if (!from || !to || from === to) {
  console.error("Usage: node scripts/copy-database.mjs --from <db> --to <db> [--only a,b] [--execute]");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

const src = client.db(from);
const dst = client.db(to);

const collections = (await src.listCollections().toArray())
  .map((c) => c.name)
  .filter((name) => !name.startsWith("system."))
  .filter((name) => !only || only.includes(name))
  .sort();

console.log(`${execute ? "COPYING" : "DRY RUN"}: ${from} -> ${to}\n`);

let totalDocs = 0;
for (const name of collections) {
  const count = await src.collection(name).countDocuments();
  totalDocs += count;
  console.log(`  ${name.padEnd(24)} ${count} docs`);

  if (!execute || count === 0) continue;

  const batch = [];
  for await (const doc of src.collection(name).find()) {
    batch.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    if (batch.length === 500) {
      await dst.collection(name).bulkWrite(batch.splice(0), { ordered: false });
    }
  }
  if (batch.length) await dst.collection(name).bulkWrite(batch, { ordered: false });

  // Recreate ordinary indexes. _id_ exists implicitly.
  const indexes = await src.collection(name).indexes();
  for (const index of indexes) {
    if (index.name === "_id_") continue;
    const { key, name: indexName, ...rest } = index;
    delete rest.v;
    delete rest.ns;
    await dst.collection(name).createIndex(key, { name: indexName, ...rest }).catch((e) => {
      console.warn(`    index ${indexName} on ${name}: ${e.message}`);
    });
  }
}

console.log(`\n${collections.length} collections, ${totalDocs} documents ${execute ? "copied" : "would be copied"}.`);
if (!execute) console.log("Re-run with --execute to perform the copy.");
if (execute) {
  console.log("\nVerify counts:");
  for (const name of collections) {
    const s = await src.collection(name).countDocuments();
    const d = await dst.collection(name).countDocuments();
    console.log(`  ${name.padEnd(24)} src=${s} dst=${d} ${s === d ? "OK" : "MISMATCH"}`);
  }
  console.log("\nRemember: Atlas Search indexes are not copied. Run create-knowledge-indexes.mjs against the target.");
}

await client.close();
