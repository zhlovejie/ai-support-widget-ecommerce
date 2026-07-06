// Run with: node seed.js
// Populates the knowledge base with sample FAQ entries so the demo is instantly usable.

require("dotenv").config();
const connectDB = require("./db");
const Document = require("./models/Document");

const SAMPLE_DOCS = [
  {
    title: "Return Policy",
    content:
      "Customers can return any unused item within 30 days of delivery for a full refund. Items must be in original packaging. Refunds are processed within 5-7 business days after we receive the return.",
    tags: ["returns", "refunds"],
  },
  {
    title: "Shipping Information",
    content:
      "We ship within the US and to Canada, the UK, and the EU. Standard shipping takes 3-5 business days domestically and 7-14 business days internationally. Free shipping on orders over $50.",
    tags: ["shipping"],
  },
  {
    title: "Plant Care Basics",
    content:
      "Most of our plants prefer indirect sunlight and watering once the top inch of soil is dry. Overwatering is the most common cause of plant issues. Each plant ships with a care card with specific instructions.",
    tags: ["product", "care"],
  },
  {
    title: "Order Tracking",
    content:
      "Once your order ships, you'll receive a tracking link by email. If you haven't received a shipping confirmation within 2 business days of ordering, please contact support@bloomandco-demo.com.",
    tags: ["orders", "tracking"],
  },
  {
    title: "Damaged Item on Arrival",
    content:
      "If your plant arrives damaged, take a photo and email it to support within 48 hours of delivery. We'll send a free replacement or issue a full refund, no return shipping required.",
    tags: ["returns", "support"],
  },
];

async function seed() {
  await connectDB();
  await Document.deleteMany({});
  await Document.insertMany(SAMPLE_DOCS);
  console.log(`[seed] Inserted ${SAMPLE_DOCS.length} sample knowledge base entries.`);
  process.exit(0);
}

seed();
