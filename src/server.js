import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT || 4000);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`FMS tracker API listening on port ${PORT}`);
  console.log(`MongoDB database: ${process.env.MONGODB_DB || "fms_tracker"}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
