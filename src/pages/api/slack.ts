// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type Data = {
  message: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method === "POST") {
    const { reviews, repository, pr_id, pr_url } = req.body;

    // Validate input
    if (!Array.isArray(reviews) || !reviews.every((review) => typeof review === "string") || typeof repository !== "string" || typeof pr_id !== "number" || typeof pr_url !== "string") {
      return res.status(400).json({ message: "Invalid input" });
    }

    // Insert data into Supabase
    const { error } = await supabase.from("sent_pr").insert([{ repository, pr_id, pr_url }]);

    if (error) {
      res.status(500).json({ message: "Error inserting data" });
    } else {
      res.status(201).json({ message: "Data inserted successfully" });
    }
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
}
