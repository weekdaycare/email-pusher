const fetch = require('node-fetch');
const FeedParser = require('feedparser-promised');
const nodemailer = require('nodemailer');
const Mustache = require('mustache');
const fs = require('fs-extra');
const path = require('path');

// 环境变量读取
const {
  INPUT_RSS_URL: rssUrl,
  INPUT_SUBSCRIBE_JSON_URL: subscribeJsonUrl,
  INPUT_EMAIL_TEMPLATE_URL: emailTemplateUrl,
  INPUT_SMTP_SERVER: smtpServer,
  INPUT_SMTP_PORT: smtpPort,
  INPUT_SMTP_USE_TLS: smtpUseTls = 'true',
  INPUT_SENDER_EMAIL: senderEmail,
  SMTP_PASSWORD: smtpPassword,
  WEBSITE_TITLE: websiteTitle,
  WEBSITE_ICON: websiteIcon,
  GITHUB_REPOSITORY: repo,
  GITHUB_TOKEN: githubToken,
} = process.env;

const LAST_ARTICLES_FILE = 'last_articles.json';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadJson(url, headers = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { headers, timeout: 10000 });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.log(`下载 JSON 失败 [${url}]，第${i + 1}次: ${err}`);
      if (i < retries - 1) await sleep(delay);
    }
  }
  return null;
}

async function getLastArticles(repo, branch, token) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/v2/last_articles.json`;
  const headers = { Authorization: `Bearer ${token}` };
  const data = await downloadJson(url, headers);
  if (!data) {
    console.log('获取 last_articles.json 失败，使用空数据');
    return { articles: [], fail_count: 0 };
  }
  return data;
}

async function saveLastArticlesToFile(articles, failCount = 0, filePath = LAST_ARTICLES_FILE) {
  const data = { articles, fail_count: failCount };
  await fs.writeJson(filePath, data, { spaces: 2, encoding: 'utf8' });
  console.log(`last_articles.json 已写入，fail_count=${failCount}`);
}

async function getSubscribeEmails(jsonUrl) {
  const data = await downloadJson(jsonUrl);
  if (!data) return [];
  const emails = data.emails || [];
  if (!emails.length) console.log('订阅邮箱列表为空');
  return emails;
}

async function parseRss(rssUrl, maxCount = 5) {
  try {
    const articles = await FeedParser.parse(rssUrl);
    return articles.slice(0, maxCount).map(entry => ({
      title: entry.title || '',
      link: entry.link || '',
      published: entry.pubDate || '',
      summary: entry.summary || entry.title || '',
    }));
  } catch (err) {
    console.log('RSS 解析异常:', err);
    return [];
  }
}

function getNewArticles(latest, last) {
  const lastLinks = new Set((last || []).map(a => a.link));
  return (latest || []).filter(a => !lastLinks.has(a.link));
}

async function downloadFile(url) {
  try {
    const resp = await fetch(url, { timeout: 10000 });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } catch (err) {
    console.log(`下载文件失败: ${url}, 错误: ${err}`);
    return null;
  }
}

function renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo) {
  return Mustache.render(templateStr, {
    website_title: websiteTitle,
    website_icon: websiteIcon,
    github_issue_url: `https://github.com/${repo}/issues`,
    title: article.title,
    summary: article.summary,
    link: article.link,
  });
}

async function sendEmail({
  smtpServer,
  smtpPort,
  smtpUseTls,
  senderEmail,
  smtpPassword,
  toEmails,
  subject,
  htmlContent,
}) {
  let transporter = nodemailer.createTransport({
    host: smtpServer,
    port: Number(smtpPort),
    secure: smtpUseTls === true || smtpUseTls === 'true' || smtpPort === '465', // true for 465, false for other ports
    auth: {
      user: senderEmail,
      pass: smtpPassword,
    },
    tls: smtpUseTls === false || smtpUseTls === 'false' ? { rejectUnauthorized: false } : undefined,
  });

  const mailOptions = {
    from: senderEmail,
    to: toEmails.join(', '),
    subject,
    html: htmlContent,
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`邮件成功发送给: ${toEmails.join(', ')}`);
      break;
    } catch (err) {
      console.log(`邮件发送失败，尝试第${attempt}次:`, err);
      if (attempt === 3) {
        console.log('所有邮件发送尝试失败');
      } else {
        await sleep(3000);
      }
    }
  }
}

async function main() {
  if (
    !rssUrl ||
    !subscribeJsonUrl ||
    !emailTemplateUrl ||
    !smtpServer ||
    !smtpPort ||
    !senderEmail ||
    !smtpPassword ||
    !repo ||
    !githubToken
  ) {
    console.log('缺少必要的环境变量或输入参数');
    process.exit(1);
  }

  // 获取上次文章数据
  const branch = 'output';
  let lastData = await getLastArticles(repo, branch, githubToken);
  let lastArticles = lastData.articles || [];
  let failCount = lastData.fail_count || 0;

  // 解析 RSS
  let latestArticles = [];
  for (let i = 0; i < 3; i++) {
    latestArticles = await parseRss(rssUrl);
    if (latestArticles.length) break;
    await sleep(2000);
  }
  if (!latestArticles.length) {
    failCount += 1;
    console.log(`获取到的文章为空，fail_count=${failCount}`);
  } else {
    failCount = 0;
  }

  // 只在 fail_count>=3 或解析成功时才覆盖
  if (failCount >= 3 || latestArticles.length) {
    await saveLastArticlesToFile(latestArticles, failCount);
  }

  // 检查新文章
  const newArticles = latestArticles.length ? getNewArticles(latestArticles, lastArticles) : [];
  if (!newArticles.length) {
    console.log('没有新文章，无需发送邮件');
  } else {
    let templateStr = await downloadFile(emailTemplateUrl);
    if (!templateStr) {
      const templatePath = path.join(__dirname, 'email_template.html');
      templateStr = await fs.readFile(templatePath, 'utf8');
    }
    const emails = await getSubscribeEmails(subscribeJsonUrl);
    for (const article of newArticles) {
      const htmlContent = renderEmailTemplate(templateStr, article, websiteTitle, websiteIcon, repo);
      const subject = `博客更新通知 - ${article.title}`;
      await sendEmail({
        smtpServer,
        smtpPort,
        smtpUseTls,
        senderEmail,
        smtpPassword,
        toEmails: emails,
        subject,
        htmlContent,
      });
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
