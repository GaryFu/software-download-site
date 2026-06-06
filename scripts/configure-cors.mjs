import { putBucketCors } from "../lib/r2.js";

const originsArg = process.argv.find((value) => value.startsWith("--origins="));
const allowedOrigins = originsArg ? originsArg.slice("--origins=".length).split(",").filter(Boolean) : ["*"];

await putBucketCors({ allowedOrigins });
console.log(`Configured R2 CORS for: ${allowedOrigins.join(", ")}`);
