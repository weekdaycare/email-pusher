import os
import json
import logging
import requests
import feedparser
import smtplib
import time
import subprocess
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Template

logging.basicConfig(level=logging.INFO)

def download_json(url, headers=None, retries=3, delay=2):
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logging.warning(f"下载 JSON 失败 [{url}]，第 {attempt+1} 次: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
    return None

def get_last_articles(repo, branch, token):
    url = f"https://raw.githubusercontent.com/{repo}/{branch}/v2/last_articles.json"
    headers = {"Authorization": f"Bearer {token}"}
    data = download_json(url, headers)
    if not data:
        logging.warning("获取 last_articles.json 失败，使用空数据")
        return {'articles': [], 'fail_count': 0}
    return data

def save_last_articles_to_file(articles, fail_count=0, path='last_articles.json'):
    data = {
        'articles': articles,
        'fail_count': fail_count
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    logging.info(f"last_articles.json 已写入，fail_count={fail_count}")

def get_subscribe_emails(json_url):
    data = download_json(json_url)
    if not data:
        return []
    emails = data.get('emails', [])
    if not emails:
        logging.warning("订阅邮箱列表为空")
    return emails

def parse_rss(rss_url, max_count=5):
    feed = feedparser.parse(rss_url)
    if feed.bozo:
        logging.error(f"RSS 解析异常: {feed.bozo_exception}")
        return []
    entries = feed.entries[:max_count]
    articles = []
    for entry in entries:
        articles.append({
            'title': entry.get('title', ''),
            'link': entry.get('link', ''),
            'published': entry.get('published', ''),
            'summary': entry.get('summary') or entry.get('title', ''),
        })
    return articles


def get_new_articles(latest, last):
    last_links = {a['link'] for a in last}
    new_articles = [a for a in latest if a['link'] not in last_links]
    return new_articles

def download_file(url):
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logging.error(f"下载文件失败: {url}, 错误: {e}")
        return None

def render_email_template(template_str, article, website_title, website_icon, repo):
    template = Template(template_str)
    return template.render(
        website_title=website_title,
        website_icon=website_icon,
        github_issue_url='https://github.com/' + repo +'/issues',
        title=article['title'],
        summary=article['summary'],
        link=article['link']
    )

def send_email(smtp_server, smtp_port, sender_email, password, to_emails, subject, html_content, smtp_tls):
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = ', '.join(to_emails)
    msg['Subject'] = subject
    msg.attach(MIMEText(html_content, 'html'))

    retries = 3
    delay = 3
    for attempt in range(retries):
        try:
            port = int(smtp_port)
            if smtp_tls:
                with smtplib.SMTP(smtp_server, port) as server:
                    server.ehlo()
                    server.starttls()
                    server.login(sender_email, password)
                    server.sendmail(sender_email, to_emails, msg.as_string())
            else:
                with smtplib.SMTP_SSL(smtp_server, port) as server:
                    server.login(sender_email, password)
                    server.sendmail(sender_email, to_emails, msg.as_string())
            logging.info(f"邮件成功发送给: {', '.join(to_emails)}")
            break
        except Exception as e:
            logging.error(f"邮件发送失败，尝试第 {attempt+1} 次: {e}")
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                logging.error("所有邮件发送尝试失败")

def main():
    """
    读取输入参数
    """
    rss_url = os.getenv('INPUT_RSS_URL')
    subscribe_json_url = os.getenv('INPUT_SUBSCRIBE_JSON_URL')
    email_template_url = os.getenv('INPUT_EMAIL_TEMPLATE_URL')
    smtp_server = os.getenv('INPUT_SMTP_SERVER')
    smtp_tls = os.getenv('INPUT_SMTP_USE_TLS', 'true').lower() == 'true'
    smtp_port = os.getenv('INPUT_SMTP_PORT')
    sender_email = os.getenv('INPUT_SENDER_EMAIL')
    smtp_password = os.getenv('SMTP_PASSWORD')
    website_title = os.getenv('WEBSITE_TITLE')
    website_icon = os.getenv('WEBSITE_ICON')
    repo = os.getenv('GITHUB_REPOSITORY')
    branch = 'output'
    token = os.getenv('GITHUB_TOKEN')

    if not all([rss_url, subscribe_json_url, email_template_url, smtp_server, smtp_port, sender_email, smtp_password, repo, token]):
        logging.error("缺少必要的环境变量或输入参数")
        exit(1)

    # 获取上次文章数据
    last_data = get_last_articles(repo, branch, token)
    last_articles = last_data.get('articles', [])
    fail_count = last_data.get('fail_count', 0)

    # 解析 RSS
    retry_times = 3
    latest_articles = []
    for i in range(retry_times):
        latest_articles = parse_rss(rss_url)
        if latest_articles:
            break
        time.sleep(2)
    if not latest_articles:
        fail_count += 1
        logging.warning(f"获取到的文章为空，fail_count={fail_count}")
    else:
        fail_count = 0

    # 只在 fail_count>=3 或解析成功时才覆盖
    if fail_count >= 3 or latest_articles:
        save_last_articles_to_file(latest_articles, fail_count)

    # 检查新文章
    new_articles = get_new_articles(latest_articles, last_articles) if latest_articles else []
    if not new_articles:
        logging.info("没有新文章，无需发送邮件")
    else:
        template_str = download_file(email_template_url)
        if not template_str:
            TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), 'email_template.html')
            with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
                template_str = f.read()
        emails = get_subscribe_emails(subscribe_json_url)
        for article in new_articles:
            html_content = render_email_template(template_str, article, website_title, website_icon, repo)
            subject = f"博客更新通知 - {article['title']}"
            send_email(smtp_server, smtp_port, sender_email, smtp_password, emails, subject, html_content, smtp_tls)

if __name__ == '__main__':
    main()
