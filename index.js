const fs = require("fs");
const path = require("path");
const axios = require("axios");
const nodemailer = require("nodemailer");
const FeedParser = require("feedparser");

// 配置日志
const log = console;

// 下载 JSON 文件
async function downloadJson(url, retries = 3, delay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`尝试下载 JSON，第 ${attempt + 1} 次，URL: ${url}`);
      const response = await fetch(url, { timeout: 10000 });
      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }
      const data = await response.json();
      console.log("JSON 下载成功:", data);
      return data;
    } catch (error) {
      console.warn(`下载 JSON 失败，第 ${attempt + 1} 次: ${error.message}`);
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error("下载 JSON 失败，超过最大重试次数");
  return null;
}

// 获取上次文章数据
async function getLastArticles(repo) {
  const url = `https://raw.githubusercontent.com/${repo}/refs/heads/output/v2/last_articles.json`;
  const data = await downloadJson(url);
  if (!data) {
    log.warn("获取 last_articles.json 失败，使用空数据");
    return { articles: [], fail_count: 0 };
  }
  return data;
}

// 保存文章到文件
function saveLastArticlesToFile(articles, failCount = 0, path = "last_articles.json") {
  const data = { articles, fail_count: failCount };
  fs.writeFileSync(path, JSON.stringify(data, null, 4), "utf-8");
  log.info(`last_articles.json 已写入，fail_count=${failCount}`);
}

// 获取订阅邮箱
async function getSubscribeEmails(jsonUrl) {
  const data = await downloadJson(jsonUrl);
  if (!data) return [];
  const emails = data.emails || [];
  if (!emails.length) log.warn("订阅邮箱列表为空");
  return emails;
}

// 解析 RSS
async function parseRss(rssUrl, maxCount = 5) {
  return new Promise((resolve, reject) => {
    const articles = [];
    const feedParser = new FeedParser();
    axios
      .get(rssUrl, { responseType: "stream" })
      .then((response) => response.data.pipe(feedParser))
      .catch((error) => reject(error));

    feedParser.on("error", (error) => reject(error));
    feedParser.on("readable", function () {
      let item;
      while ((item = this.read()) && articles.length < maxCount) {
        articles.push({
          title: item.title || "",
          link: item.link || "",
          published: item.pubDate || "",
          summary: item.description || item.title || "",
        });
      }
    });
    feedParser.on("end", () => resolve(articles));
  });
}

// 获取新文章
function getNewArticles(latest, last) {
  const lastLinks = new Set(last.map((a) => a.link));
  return latest.filter((a) => !lastLinks.has(a.link));
}

// 下载文件
async function downloadFile(url) {
  try {
    const response = await axios.get(url, { timeout: 10000 });
    return response.data;
  } catch (error) {
    log.error(`下载文件失败: ${url}, 错误: ${error.message}`);
    return null;
  }
}

// 加载邮件模板
async function loadEmailTemplate(emailTemplateUrl, defaultTemplatePath) {
  let templateStr = "";
  if (emailTemplateUrl) {
    try {
      templateStr = await downloadFile(emailTemplateUrl);
      if (!templateStr) {
        throw new Error("下载的模板内容为空");
      }
    } catch (error) {
      console.warn(`无法下载邮件模板，使用本地默认模板: ${error.message}`);
    }
  } else {
    templateStr = fs.readFileSync(defaultTemplatePath, "utf-8");
    console.info("已加载本地默认邮件模板");
  }

  return templateStr;
}


// 渲染 HTML 模板
function renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo) {
  return templateStr
    .replace(/{{ website_title }}/g, websiteTitle)
    .replace(/{{ website_icon }}/g, websiteIcon)
    .replace(/{{ github_issue_url }}/g, `https://github.com/${repo}/issues`)
    .replace(/{{ title }}/g, article.title)
    .replace(/{{ summary }}/g, article.summary)
    .replace(/{{ link }}/g, article.link);
}


// 发送邮件
async function sendEmail(smtpConfig, senderEmail, toEmails, subject, htmlContent) {
  const transporter = nodemailer.createTransport(smtpConfig);

  const mailOptions = {
    from: senderEmail,
    to: toEmails.join(", "),
    subject,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    log.info(`邮件成功发送给: ${toEmails.join(", ")}`);
  } catch (error) {
    log.error(`邮件发送失败: ${error.message}`);
  }
}

// 主函数
async function main() {
  const rssUrl = process.env.INPUT_RSS_URL;
  const subscribeJsonUrl = process.env.INPUT_SUBSCRIBE_JSON_URL;
  const emailTemplateUrl = process.env.INPUT_EMAIL_TEMPLATE_URL;
  const smtpServer = process.env.INPUT_SMTP_SERVER;
  const smtpPort = process.env.INPUT_SMTP_PORT;
  const smtpUseTls = process.env.INPUT_SMTP_USE_TLS === "true";
  const senderEmail = process.env.INPUT_SENDER_EMAIL;
  const smtpPassword = process.env.INPUT_SMTP_PASSWORD;
  const websiteTitle = process.env.INPUT_WEBSITE_TITLE;
  const websiteIcon = process.env.INPUT_WEBSITE_ICON;
  const repo = process.env.GITHUB_REPOSITORY;

  const lastData = await getLastArticles(repo);
  const lastArticles = lastData.articles || [];
  let failCount = lastData.fail_count || 0;

  let latestArticles = [];
  for (let i = 0; i < 3; i++) {
    try {
      latestArticles = await parseRss(rssUrl);
      if (latestArticles.length > 0) break;
    } catch (error) {
      log.warn(`RSS 解析失败: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!latestArticles.length) {
    failCount += 1;
    log.warn(`获取到的文章为空，fail_count=${failCount}`);
  } else {
    failCount = 0;
  }

  if (failCount >= 3 || latestArticles.length > 0) {
    saveLastArticlesToFile(latestArticles, failCount);
  }

  const newArticles = getNewArticles(latestArticles, lastArticles);
  if (!newArticles.length) {
    log.info("没有新文章，无需发送邮件");
    return;
  }

  const defaultTemplatePath = path.join(__dirname, "email_template.html");
  const templateStr = await loadEmailTemplate(emailTemplateUrl, defaultTemplatePath);
  const emails = await getSubscribeEmails(subscribeJsonUrl);

  for (const article of newArticles) {
    const htmlContent = renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo);
    const subject = `博客更新通知 - ${article.title}`;
    const smtpConfig = {
      host: smtpServer,
      port: smtpPort,
      secure: !smtpUseTls,
      auth: { user: senderEmail, pass: smtpPassword },
    };
    await sendEmail(smtpConfig, senderEmail, emails, subject, htmlContent);
  }
}

main().catch((error) => log.error(`主函数运行失败: ${error.message}`));
