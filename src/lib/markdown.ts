import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

export async function getMarkdownContent(filename: string): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", filename);
  const fileContents = fs.readFileSync(filePath, "utf8");
  const { content } = matter(fileContents);
  const processed = await remark().use(html).process(content);
  return processed.toString();
}
