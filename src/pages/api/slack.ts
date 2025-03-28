// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL!;
const supabase = createClient(supabaseUrl, supabaseKey);

type Data = {
  message: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  // APIキーの検証
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({ message: "Forbidden: Invalid API key" });
  }

  if (req.method === "POST") {
    const { reviewers, repository, pr_id, pr_url, pr_title, type } = req.body;

    // 入力のバリデーション
    if (
      !Array.isArray(reviewers) ||
      !reviewers.every((reviewer) => typeof reviewer === "string") ||
      typeof repository !== "string" ||
      typeof pr_id !== "number" ||
      typeof pr_url !== "string" ||
      typeof pr_title !== "string" ||
      !["feature", "release", "hotfix"].includes(type)
    ) {
      return res.status(400).json({ message: "Invalid input" });
    }

    // データベースに同じPRが存在するか確認
    const { data: existingPr, error: checkError } = await supabase.from("sent_pr").select("id").eq("repository", repository).eq("pr_id", pr_id).single();

    if (checkError && checkError.code !== "PGRST116") {
      // エラーが「No rows found」でない場合はエラーを返す
      return res.status(500).json({ message: "Error checking existing PR" });
    }

    if (existingPr) {
      // レコードが存在する場合、処理をスキップ
      return res.status(200).json({ message: "PR already processed" });
    }

    // 各レビュアーのslack_idを取得
    const { data: userMapData, error: userMapError } = await supabase.from("user_map").select("slack_id").in("github_id", reviewers);

    if (userMapError || !userMapData) {
      return res.status(500).json({ message: "Error retrieving Slack IDs" });
    }

    // slack_idが存在しないレビュアーを除外
    const validSlackIds = userMapData.filter((user) => user.slack_id).map((user) => `<@${user.slack_id}>`);

    // 有効なslack_idが見つからない場合、処理を中断
    if (validSlackIds.length === 0) {
      return res.status(400).json({ message: "No valid Slack IDs found for reviewers" });
    }

    // メッセージの色と内容をtypeに基づいて設定
    let color = "good"; // デフォルトは緑色
    let messageIntro = "新しい機能のレビュー依頼が届きました！✨🛠️"; // デフォルトメッセージ
    let finalMessage = "レビューをよろしくお願いします！👍✨"; // デフォルトの最後の一文
    let title = "PRレビュー依頼"; // デフォルトのタイトル

    if (type === "release") {
      color = "warning"; // 黄色
      messageIntro = "リリースPRが届きました！📦🚀";
      finalMessage = "リリースに向けて確認をお願いします！📤✨";
      title = "リリースPRレビュー依頼";
    } else if (type === "hotfix") {
      color = "danger"; // 赤色
      messageIntro = "🔥【HOTFIX】緊急対応のPRです！🚨\n至急レビューをお願いします！";
      finalMessage = "早急な対応をお願いします！⏩🔥";
      title = "🔥【HOTFIX】PRレビュー依頼🔥"; // 強調されたタイトル
    }

    // 有効なslack_idを1つのメッセージにまとめる
    const mentions = validSlackIds.join("さん、");
    const slackMessage = {
      attachments: [
        {
          color, // typeに基づく色
          title, // タイトルをtypeに基づいて設定
          text: `${mentions}さん、${messageIntro}\n\n【リポジトリ】${repository}\n【タイトル】${pr_title}\n【詳細】${pr_url}\n\n💻👉 ${finalMessage}`,
        },
      ],
    };

    // Slackにメッセージを送信
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      return res.status(500).json({ message: "Failed to send message to Slack" });
    }

    // データをSupabaseに挿入
    const { error } = await supabase.from("sent_pr").insert([{ repository, pr_id, pr_url, pr_title, type }]);

    if (error) {
      res.status(500).json({ message: "Error inserting data" });
    } else {
      res.status(201).json({ message: "Data inserted successfully" });
    }
  } else {
    // メソッドが許可されていない場合のエラーメッセージ
    res.status(405).json({ message: "Method not allowed" });
  }
}
