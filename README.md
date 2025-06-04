# Blog Email Pusher

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Action-blue?logo=github)](https://github.com/marketplace?type=actions)

A GitHub Action to send blog update emails to your subscribers.  
It parses your RSS feed, detects new articles, and sends a notification email using a custom HTML template.

---

## Features

- Fetches and parses RSS feed
- Detects new articles since last run
- Sends notification emails to a list of subscribers
- Uses customizable HTML email template
- Supports SMTP authentication

---

## Usage

### 1. Add the Action to your workflow

```yaml
name: Email_pusher

on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:

jobs:
  email-pusher:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Send Blog Update Email
        uses: weekdaycare/email-pusher@main
        with:
          rss_url: "https://weekdaycare.cn/atom.xml"
          smtp_server: "smtp.feishu.cn"
          smtp_port: 587
          sender_email: "comment@weekdaycare.cn"
          smtp_use_tls: "true"
          subscribe_json_url: "https://raw.githubusercontent.com/weekdaycare/Friends-issue/output/v2/subscribe.json"
          website_title: "星日语"
          website_icon: "https://weekdaycare.cn/asset/avatar.svg"
          smtp_password: ${{ secrets.SMTP_PASSWORD }}

      - name: Save last_articles.json
        run: |
          cp last_articles.json /tmp/last_articles.json

      - name: Switch to output branch and update file
        run: |
          git fetch origin output
          git checkout output
          mkdir -p v2
          cp /tmp/last_articles.json v2/last_articles.json
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add v2/last_articles.json
          git commit -m "Update last_articles.json [bot]" || echo "No changes to commit"
          git push origin HEAD:output
```

### 2. Inputs

| Name               | Description                       | Required | Example                          |
|--------------------|-----------------------------------|----------|-----------------------------------|
| rss_url            | RSS feed URL                      | true     | `https://your-blog.com/rss.xml`   |
| smtp_server        | SMTP server                       | true     | `smtp.gmail.com`                  |
| smtp_port          | SMTP port                         | true     | `465`                             |
| smtp_tls           | SMTP TLS                          | true     | `false`                           |
| sender_email       | Sender email address              | true     | `your@email.com`                  |
| smtp_password      | SMTP password (use secrets)       | true     | `${{ secrets.SMTP_PASSWORD }}`    |
| subscribe_json_url | JSON URL of subscriber emails     | true     | `https://your.com/subscribers.json`|
| website_title      | Your website title                | false    | `My Blog`                         |
| website_icon       | Website icon URL                  | false    | `https://your.com/favicon.ico`    |

> **Tip:** Store sensitive info (SMTP password) in GitHub [Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets).

---

## Output

- Lastest_articles in `output` branch
- Sends a styled HTML email to all emails listed in your subscriber JSON.
- Only sends when new articles are detected.

---

## Example subscriber JSON

```json
{
  "emails": [
    "user1@example.com",
    "user2@example.com"
  ]
}
```

---

## Customizing the Email Template

To customize the email style, edit `email_template.html` in this repository .

---

## License

MIT

---
