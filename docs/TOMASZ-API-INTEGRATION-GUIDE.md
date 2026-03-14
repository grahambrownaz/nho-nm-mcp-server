# API Integration Guide for Tomasz

**Project:** NHO/NM MCP Data Server
**Date:** February 20, 2026
**Author:** Graham Brown
**Purpose:** Connect the MCP server to the real LeadsPlease databases and build the Subscription API and Intent demographic on the Consumer database.

---

## What This MCP Server Delivers

This MCP server is the AI-powered interface for LeadsPlease's data products. It allows users — through AI assistants like Claude Desktop, ChatGPT, or any MCP-compatible client — to do everything they can currently do on the LeadsPlease website, but conversationally, with an AI guiding them through the process.

### What a User Can Do With This System

The following is the complete list of functions a user can perform through this MCP server. Each function describes what the user asks for, what happens behind the scenes, and which databases/APIs are involved. **This is what Tomasz's API work needs to power.**

---

#### FUNCTION 1: Search Any Database and Preview Results

**What the user does:** Asks for data from any of our databases — Consumer, NHO, New Mover — filtered by geography (ZIP codes, cities, counties, states, radius, or nationwide) and demographics (income, age, home value, dwelling type, children, owner/renter, etc.).

**What happens:**
1. `preview_count` queries the database and returns the total number of matching records
2. `get_sample_data` returns 5-10 sample records (without email/phone) so the user can verify data quality
3. `get_filter_options` shows available filter values for the selected database
4. `get_pricing` quotes the cost based on volume and add-ons (email append, phone append)

**Example:** *"How many new homeowners are there in Maricopa County, AZ who bought homes over $300K in the last 90 days?"*

**Databases involved:** Consumer, NHO, New Mover

---

#### FUNCTION 2: Purchase a Data List (One-Time)

**What the user does:** After previewing, the user purchases a list of records as a one-time download.

**What happens:**
1. `purchase_list` creates a Stripe checkout session for the quoted amount
2. User pays via Stripe
3. Records are pulled from the database with the requested fields (name, address, email, phone, demographics)
4. `export_data` generates a CSV, Excel, or JSON file and stores it in S3
5. User receives a download link

**Example:** *"I want to buy 5,000 new homeowners in AZ with email addresses — give me a CSV."*

**Databases involved:** Consumer, NHO, New Mover

---

#### FUNCTION 3: Set Up a Recurring Data Subscription (Data Only)

**What the user does:** Subscribes to receive fresh data automatically on a schedule — daily, weekly, biweekly, or monthly.

**What happens:**
1. `create_subscription` configures the database, geography, demographic filters, frequency, and delivery method
2. The cron-based subscription processor runs on schedule and queries the database for new records
3. Records are deduplicated against all previously delivered records (so the user never gets the same person twice)
4. Output is generated as CSV or Excel
5. Delivery via the configured method: email attachment, SFTP upload, S3 download link, or webhook POST

**Example:** *"Every Monday, send me the latest new movers in ZIP codes 85001-85010 as a CSV to my SFTP server."*

**Databases involved:** Consumer, NHO, New Mover, Intent

---

#### FUNCTION 4: Set Up a Recurring Postcard Subscription (Data + Print)

**What the user does:** Subscribes to automatically send postcards or letters to new records as they appear in the database — on a recurring schedule.

**What happens:**
1. User selects or uploads a postcard/letter template via `browse_templates` or `upload_template`
2. `create_subscription` configures the database, geography, filters, frequency, and sets fulfillment method to `PRINT_MAIL`
3. The subscription processor runs on schedule:
   a. Queries the database for new records matching the criteria
   b. Deduplicates against previously mailed records
   c. `generate_postcard_pdf` creates a personalized PDF for each recipient using the template (merging name, address, and any other fields)
   d. Sends the print job to the configured fulfillment provider
4. Print fulfillment options:
   - **Lob** — API-based print and mail (postcards, letters, checks)
   - **PostGrid** — API-based print and mail
   - **Stannp** — API-based print and mail (UK + US)
   - **Reminder Media** — Automated direct mail campaigns
   - **SFTP Hot Folder** — Upload print-ready PDFs + JDF job tickets to an SFTP server for in-house or third-party printing
5. `get_fulfillment_status` tracks the print job status (queued, printing, in transit, delivered)

**Example:** *"Every week, send a 'Welcome to the Neighborhood' postcard to every new mover who moves into Scottsdale, AZ. Use our HVAC services template. Mail via Lob."*

**This is a key revenue function** — it combines data subscription + template personalization + print fulfillment into a fully automated direct mail pipeline.

**Databases involved:** Consumer, NHO, New Mover

---

#### FUNCTION 5: Set Up a Recurring Email Campaign Subscription (Data + Email)

**What the user does:** Subscribes to automatically send email campaigns to new records as they appear.

**What happens:**
1. `configure_email_account` connects to the user's ReachMail account
2. `create_subscription` configures the database, geography, filters, frequency, with email delivery
3. On each cycle, new records (with email addresses) are:
   a. Pulled from the database and deduplicated
   b. Added to a ReachMail list via `create_email_list`
   c. A campaign is triggered via `send_email_campaign`
4. `get_email_analytics` provides open rates, click rates, bounces, and unsubscribes

**Example:** *"Every week, email a special offer to new homeowners in Phoenix who bought homes over $500K."*

**Databases involved:** Consumer, NHO, New Mover (with email append)

---

#### FUNCTION 6: Find and Act on High-Intent Prospects

**What the user does:** Searches for consumers who are actively showing purchase intent — people browsing for products, comparing services, filling out forms online.

**What happens:**
1. `list_intent_categories` shows the 46 available intent categories (home purchase, auto insurance, HVAC services, etc.)
2. `search_intent_data` queries the intent database filtered by category, geography, intent score (1-100), signal recency, and contact info requirements
3. Results include the consumer's contact info + intent score + signal details (what they searched for, when, how strong the signal is)
4. User can then purchase the list, export it, sync it to Mailchimp/HubSpot, or trigger a postcard campaign

**Example:** *"Show me homeowners in Phoenix with an intent score above 70 for HVAC services — these people are actively looking for AC repair."*

**Databases involved:** Intent (cross-referenced with Consumer for demographics)

---

#### FUNCTION 7: Subscribe to Real-Time Intent Alerts

**What the user does:** Sets up a webhook to receive intent signals in real time as they happen.

**What happens:**
1. `configure_intent_webhook` registers a webhook URL with optional filters (minimum intent score, specific categories)
2. `create_intent_subscription` activates the subscription with geography, categories, and a monthly signal cap
3. As new intent signals are detected, they are POSTed to the webhook URL in real time
4. Delivery options: webhook (real-time), batch email (hourly/daily/weekly), batch SFTP, or API polling

**Example:** *"Send me a webhook every time someone in my territory shows home_purchase intent with a score above 80."*

**Databases involved:** Intent

---

#### FUNCTION 8: Target the Turning 65 Demographic

**What the user does:** Finds consumers who are turning 65 within a specified time window — a high-value demographic for Medicare, retirement planning, and healthcare marketing.

**What happens:**
1. The Consumer database is filtered for people turning 65 within N months
2. All standard geography and demographic filters still apply
3. Can be combined with intent data (e.g., "people turning 65 who show health_insurance intent")
4. Can be delivered as a one-time purchase, recurring subscription, postcard campaign, or email campaign

**Example:** *"Get me everyone turning 65 in the next 6 months in Florida with home values over $250K — I sell Medicare supplement plans."*

**Databases involved:** Consumer (with age/birth date filtering)

---

#### FUNCTION 9: Sync Data to Marketing Platforms

**What the user does:** Pushes data directly into their existing marketing tools — no CSV export/import required.

**What happens:**
1. `configure_platform_connection` connects to Mailchimp, HubSpot, or Zapier with API credentials
2. `sync_to_platform` pushes records from any search or subscription directly into the platform
3. Records are created or updated (deduplication by email or name+address)
4. Can be configured as a sync channel on a subscription (auto-sync on every delivery)

**Supported platforms:**
- **Mailchimp** — adds/updates contacts in an audience, with tags and merge fields
- **HubSpot** — creates/updates contacts in CRM with custom properties
- **Zapier** — triggers a Zap for each record (connects to 5,000+ apps)

**Example:** *"Every time my weekly new mover subscription delivers, automatically push the records into my HubSpot CRM."*

---

#### FUNCTION 10: Manage Templates for Print Campaigns

**What the user does:** Browses, uploads, or customizes postcard and letter templates for direct mail.

**What happens:**
1. `browse_templates` shows available templates by category (HVAC, realtor, insurance, roofing, dental, etc.)
2. `upload_template` lets the user upload their own HTML design with merge fields ({{firstName}}, {{address}}, etc.)
3. `import_design` imports a design from a URL or file
4. `generate_postcard_pdf` creates a preview PDF with sample data so the user can approve the design before mailing
5. Templates are stored and linked to subscriptions for automated personalization

**Example:** *"Show me the available HVAC postcard templates. I want to preview the 'Summer AC Special' one with sample data."*

---

#### FUNCTION 11: Export Data in Multiple Formats

**What the user does:** Exports search results or subscription data as downloadable files.

**What happens:**
1. `export_data` generates a file in CSV, Excel (.xlsx), or JSON format
2. Files are stored in S3 with a signed download URL
3. Can include all fields or a custom selection
4. Large exports are processed asynchronously with status tracking

**Example:** *"Export the last month of new homeowner data for all of Arizona as an Excel file."*

---

#### FUNCTION 12: Billing and Payment Management

**What the user does:** Manages their billing, views invoices, and makes payments.

**What happens:**
1. `create_checkout_session` generates a Stripe checkout page for one-time purchases
2. `create_payment_link` generates a reusable Stripe payment link
3. `get_billing_status` shows current plan, usage, and upcoming charges
4. `get_billing_portal` opens the Stripe customer portal for invoice history, payment method updates, and subscription management

---

#### FUNCTION 13: Competitive Intelligence (SWOTSPOT)

**What the user does:** Audits their local search presence on Google Maps and tracks competitors.

**What happens:**
1. `configure_swotspot` links the user's business to the SWOTSPOT system
2. `run_local_audit` scans a 5x5 grid of GPS points around the business, checks Google Maps rankings at each point, and generates a SWOT report
3. `track_competitor` adds competitors for ongoing monitoring
4. `list_audits` shows historical audit results and trends

**Example:** *"Run a local SEO audit on my plumbing company and show me who's outranking me in my area."*

---

### FULL-CYCLE MARKETING STACK (NEW — TO BE BUILT)

The following functions represent the **aspirational vision** for the MCP server — turning it from a data delivery tool into a **complete marketing automation platform** that a user can operate entirely through ChatGPT or Claude. These functions require new tools, services, and API integrations to be built.

---

#### FUNCTION 14: Full-Cycle Postcard + Landing Page Campaign

**What the user does:** Creates a complete direct mail campaign with a custom landing page, QR code, and response tracking — all from a single conversation.

**What happens (the full pipeline):**
1. User describes their campaign goal (e.g., "I want to send a welcome postcard to new movers in Scottsdale offering a free AC inspection")
2. `search_data` + `preview_count` pulls the target list from the NHO/NM/Consumer database
3. `create_landing_page` generates a hosted landing page with:
   - A lead capture form (name, email, phone, appointment request)
   - Campaign branding (logo, colors, offer details)
   - Mobile-responsive design
   - Hosted on a LeadsPlease subdomain or custom domain (e.g., offers.hvaccompany.com/welcome)
4. `generate_qr_code` creates a unique QR code that links to the landing page
   - Optionally: per-recipient unique QR codes for individual tracking
   - QR code includes UTM parameters for analytics
5. `upload_template` or `browse_templates` selects a postcard design
6. The QR code is merged into the postcard template as a dynamic field ({{qr_code_image}})
7. `generate_postcard_pdf` creates print-ready PDFs with personalized content + QR code
8. `create_subscription` (with fulfillment method `PRINT_MAIL`) sends the postcards via Lob/PostGrid/Stannp
9. As recipients scan the QR code and fill out the landing page form:
   - `get_landing_page_responses` shows all sign-ups, form submissions, and appointments
   - Responses are automatically captured in the system
10. `create_email_campaign` sends automated follow-up emails to landing page respondents
11. `send_sms_message` sends automated SMS follow-ups to respondents who provided phone numbers
12. `get_campaign_analytics` shows the full funnel: postcards sent → QR scans → landing page visits → form submissions → email opens → SMS delivered

**Example conversation:**
- User: *"I'm an HVAC company in Scottsdale. Send a 'Free AC Tune-Up' postcard to every new homeowner in the 85251-85260 ZIP codes. Include a QR code to a landing page where they can book an appointment. Then send a follow-up email to everyone who signs up."*
- AI: Finds 2,340 new homeowners, creates a landing page, generates QR code, selects HVAC template, merges data, sends postcards via Lob, sets up email automation for respondents.

**This is the killer feature** — a complete marketing campaign, from data to print to digital response capture, orchestrated entirely by AI.

**New tools needed:** `create_landing_page`, `generate_qr_code`, `get_landing_page_responses`, `send_sms_message`, `get_campaign_analytics`
**New services needed:** Landing page builder/host, QR code generator, SMS provider (Twilio/MessageBird), response tracking database

---

#### FUNCTION 15: Create and Host a Landing Page

**What the user does:** Creates a hosted landing page for lead capture, event registration, or offer redemption.

**What happens:**
1. `create_landing_page` takes:
   - Page title, headline, body copy, call-to-action
   - Form fields to collect (name, email, phone, address, custom fields)
   - Branding (logo URL, primary color, background image)
   - Thank-you message or redirect URL after form submission
   - Optional: appointment scheduling integration (Calendly embed)
2. The system generates a responsive HTML page and hosts it on our infrastructure
3. Returns a public URL (e.g., `pages.leadsplease.com/abc123` or a custom domain)
4. `list_landing_pages` shows all active landing pages with visit/conversion stats
5. `update_landing_page` modifies an existing page
6. `delete_landing_page` removes a page

**Example:** *"Create a landing page for my dental practice. Title: 'New Patient Special — Free Cleaning'. Collect name, email, phone, and preferred appointment date. Use blue and white branding."*

**New tools needed:** `create_landing_page`, `list_landing_pages`, `update_landing_page`, `delete_landing_page`
**New services needed:** Landing page hosting (Cloudflare Pages/Workers, or S3 + CloudFront), form submission handler, page builder engine

---

#### FUNCTION 16: Generate QR Codes for Print Campaigns

**What the user does:** Creates QR codes that link to landing pages, websites, or tracking URLs — for embedding in postcards, letters, and flyers.

**What happens:**
1. `generate_qr_code` takes a destination URL and optional styling (color, logo overlay, size)
2. Returns a QR code image (PNG/SVG) stored in S3
3. Options:
   - **Static QR code**: One QR code for all recipients (links to the same landing page)
   - **Dynamic QR code**: Unique QR code per recipient with tracking parameters (e.g., `?rid=12345`) so we know exactly which recipient scanned
   - **Branded QR code**: Custom colors, logo in center, rounded corners
4. QR codes are added to postcard/letter templates as a merge field: `{{qr_code_url}}`
5. The PDF generator renders the QR code image onto each postcard
6. `get_qr_scan_analytics` shows scan counts, scan times, device types, and locations

**Example:** *"Generate a branded QR code with my company logo that links to the landing page we just created. Make it red to match my brand."*

**New tools needed:** `generate_qr_code`, `get_qr_scan_analytics`
**New services needed:** QR code generation library (qrcode npm package), short URL/redirect service for tracking, scan analytics

---

#### FUNCTION 17: Send SMS Messages and Campaigns

**What the user does:** Sends SMS/text messages to leads, landing page respondents, or data lists — individually or as campaigns.

**What happens:**
1. `configure_sms_account` connects to an SMS provider (Twilio, MessageBird, or similar)
2. `send_sms_message` sends a single SMS to a phone number
3. `create_sms_campaign` creates a bulk SMS campaign:
   - Provide a list of recipients (from a data search, landing page responses, or uploaded list)
   - Message template with merge fields ({{firstName}}, {{offerCode}}, etc.)
   - Schedule for immediate or future delivery
   - Opt-out handling (STOP keyword processing)
4. `get_sms_analytics` shows delivery rates, responses, opt-outs
5. SMS can be triggered automatically:
   - When a new landing page form submission comes in → send confirmation SMS
   - When a postcard is delivered → send "check your mailbox" SMS
   - On a schedule as part of a subscription (similar to email campaigns)

**Example:** *"Send an SMS to everyone who signed up on the landing page: 'Hi {{firstName}}, thanks for booking your free AC tune-up! We'll call you within 24 hours to confirm. Reply STOP to opt out.'"*

**New tools needed:** `configure_sms_account`, `send_sms_message`, `create_sms_campaign`, `get_sms_analytics`
**New services needed:** SMS provider API (Twilio recommended — SMS, MMS, opt-out management)

---

#### FUNCTION 18: Automated Email Drip Sequences

**What the user does:** Sets up a multi-step automated email sequence that triggers when new leads enter the system — from data delivery, landing page sign-ups, or QR code scans.

**What happens:**
1. `create_email_sequence` defines a series of emails sent over time:
   - Email 1: Sent immediately (welcome/confirmation)
   - Email 2: Sent 3 days later (value add/education)
   - Email 3: Sent 7 days later (offer/CTA)
   - Email 4: Sent 14 days later (final follow-up)
2. Each email has its own subject, HTML body, and merge fields
3. Triggers:
   - **Landing page submission**: New form responses automatically enter the sequence
   - **Data subscription delivery**: New records automatically get drip emails
   - **Manual enrollment**: Add specific contacts to a sequence
4. `list_email_sequences` shows active sequences with performance metrics
5. `get_sequence_analytics` shows per-step open rates, click rates, and drop-off
6. Smart features:
   - Skip emails if recipient has already responded
   - Pause sequence if recipient replies
   - Remove from sequence if they opt out

**Example:** *"Create a 4-email welcome sequence for new homeowners. Email 1 today: welcome + coupon. Email 2 in 3 days: tips for new homeowners. Email 3 in 7 days: reminder about the coupon. Email 4 in 14 days: last chance offer."*

**New tools needed:** `create_email_sequence`, `list_email_sequences`, `get_sequence_analytics`, `enroll_in_sequence`
**Enhancement to existing:** Extend ReachMail integration or add dedicated drip email service (e.g., ConvertKit API, Mailgun sequences, or custom scheduler)

---

#### FUNCTION 19: Full Campaign Analytics Dashboard

**What the user does:** Gets a unified view of campaign performance across all channels — postcards, email, SMS, landing pages, QR codes.

**What happens:**
1. `get_campaign_analytics` returns a unified funnel for any campaign:
   - **Print**: Postcards sent, estimated delivery dates, mail tracking (if available via Lob)
   - **QR Codes**: Total scans, unique scans, scan-to-visit rate
   - **Landing Pages**: Page visits, form submissions, conversion rate
   - **Email**: Sent, delivered, opens, clicks, replies, bounces, unsubscribes
   - **SMS**: Sent, delivered, responses, opt-outs
   - **Conversions**: Form submissions, appointments booked, purchases made
2. `compare_campaigns` compares performance of multiple campaigns side by side
3. `get_roi_report` calculates return on investment:
   - Total spend (data + print + postage + email + SMS)
   - Total responses/conversions
   - Cost per lead, cost per conversion
   - Revenue attribution (if user reports revenue)

**Example:** *"Show me how my February new mover campaign performed. How many postcards were sent, how many scanned the QR code, how many signed up on the landing page, and how many opened the follow-up emails?"*

**New tools needed:** `get_campaign_analytics`, `compare_campaigns`, `get_roi_report`
**Enhancement to existing:** Unified campaign model linking subscriptions, deliveries, landing pages, emails, and SMS

---

#### FUNCTION 20: Multi-Channel Campaign Orchestration

**What the user does:** Creates a complete multi-channel campaign in a single conversation — combining data, postcards, landing pages, QR codes, email, and SMS into one automated workflow.

**What happens:**
1. `create_campaign` orchestrates the entire flow:
   - **Step 1 — Data**: Select database, geography, demographics
   - **Step 2 — Landing Page**: Auto-generate or select existing page
   - **Step 3 — QR Code**: Generate and embed in postcard template
   - **Step 4 — Print**: Send postcards to the data list
   - **Step 5 — Email Sequence**: Set up drip emails for landing page respondents
   - **Step 6 — SMS Follow-up**: Configure SMS confirmations and reminders
   - **Step 7 — Analytics**: Track the full funnel automatically
2. The campaign runs on autopilot:
   - If it's a recurring subscription, new records get postcards each week
   - Landing page responses trigger email + SMS sequences automatically
   - Analytics update in real time
3. `list_campaigns` shows all active campaigns with status and performance
4. `pause_campaign` / `resume_campaign` / `cancel_campaign` manage lifecycle

**Example:** *"Set up a complete monthly campaign: Every month, send 'Just Sold' postcards to new homeowners in Scottsdale 85251. Include a QR code linking to a landing page where they can get a free home valuation. When they sign up, send them a 3-email sequence about our services, plus a welcome SMS."*

**New tools needed:** `create_campaign`, `list_campaigns`, `pause_campaign`, `resume_campaign`, `cancel_campaign`
**This is the orchestration layer** that ties all the individual tools together into automated workflows.

---

### Gap Analysis: What Exists vs. What Needs to Be Built

| Capability | Current Status | What Needs to Be Built |
|-----------|---------------|----------------------|
| **Data Search & Purchase** | Exists (mock data) | Connect to real LeadsPlease API |
| **Recurring Subscriptions** | Exists (mock data) | Connect to real API |
| **Postcard Templates** | Exists (4 tools) | Working — needs real template library |
| **PDF Generation** | Exists (Puppeteer) | Working — needs QR code merge field support |
| **Print Fulfillment** | Exists (Lob, PostGrid, Stannp, Reminder Media, SFTP) | Working — needs real API keys |
| **Email Marketing** | Exists (6 tools, ReachMail) | Working — needs real ReachMail credentials |
| **Platform Sync** | Exists (Mailchimp, HubSpot, Zapier) | Working — needs real API keys |
| **Landing Pages** | **NOT BUILT** | New service: page builder, hosting, form handler |
| **QR Codes** | **NOT BUILT** | New service: QR generation, dynamic URLs, scan tracking |
| **SMS Messaging** | **NOT BUILT** | New service: Twilio/MessageBird integration |
| **Email Drip Sequences** | **NOT BUILT** | New service: multi-step email scheduler |
| **Campaign Orchestration** | **NOT BUILT** | New service: unified campaign model linking all channels |
| **Unified Analytics** | **NOT BUILT** | New service: cross-channel funnel tracking |
| **Deduplication** | Exists | Working |
| **Stripe Billing** | Exists (4 tools) | Working |
| **SWOTSPOT Integration** | Exists (4 tools) | Working |

### New Tools Summary (To Be Built)

| Category | New Tools | Priority |
|----------|-----------|----------|
| **Landing Pages** (4) | create_landing_page, list_landing_pages, update_landing_page, delete_landing_page | HIGH |
| **QR Codes** (2) | generate_qr_code, get_qr_scan_analytics | HIGH |
| **SMS** (4) | configure_sms_account, send_sms_message, create_sms_campaign, get_sms_analytics | MEDIUM |
| **Email Sequences** (4) | create_email_sequence, list_email_sequences, get_sequence_analytics, enroll_in_sequence | MEDIUM |
| **Campaigns** (5) | create_campaign, list_campaigns, pause_campaign, resume_campaign, cancel_campaign | HIGH |
| **Analytics** (3) | get_campaign_analytics, compare_campaigns, get_roi_report | MEDIUM |

**Total: 22 new tools bringing the MCP server from 27 to ~49 tools.**

### New Services and APIs Required

| Service | Purpose | Recommended Provider | Estimated Cost |
|---------|---------|---------------------|---------------|
| **Landing Page Hosting** | Host generated pages with forms | Cloudflare Workers/Pages (already have infra) | Free-$20/mo |
| **QR Code Generation** | Generate static/dynamic/branded QR codes | `qrcode` npm package (free) + custom short URL service | Free |
| **QR/URL Redirect & Tracking** | Track QR scans with redirect service | Custom Workers route or Bitly API | Free-$35/mo |
| **SMS Provider** | Send SMS, handle opt-outs, delivery receipts | Twilio ($0.0079/SMS sent, $0.0079/received) | Usage-based |
| **Drip Email Scheduler** | Time-delayed email sequences | Custom cron + ReachMail (already integrated) or ConvertKit | Included with ReachMail |
| **Form Submission Storage** | Store landing page responses | PostgreSQL (already have DB) + new Prisma models | Free |
| **Analytics Pipeline** | Cross-channel funnel tracking | Custom aggregation on existing DB | Free |

### New Prisma Models Required

```
LandingPage         — id, tenantId, title, slug, html, formFields, branding, published, url
LandingPageResponse — id, landingPageId, formData (JSON), sourceQrCode, ipAddress, userAgent, timestamp
QrCode              — id, tenantId, destinationUrl, trackingUrl, imageUrl, type (static/dynamic), style
QrScan              — id, qrCodeId, scannedAt, ipAddress, userAgent, location
SmsConfig           — id, tenantId, twilioAccountSid, twilioAuthToken, twilioPhoneNumber
SmsCampaign         — id, tenantId, name, message, recipientCount, status, sentAt, analytics
SmsMessage          — id, campaignId, to, body, status, deliveredAt, response
EmailSequence       — id, tenantId, name, triggerType, steps (JSON), status
EmailSequenceStep   — id, sequenceId, stepNumber, delayHours, subject, htmlBody, sentCount, openRate
EmailSequenceEnrollment — id, sequenceId, contactEmail, currentStep, status, enrolledAt
Campaign            — id, tenantId, name, type, subscriptionId, landingPageId, qrCodeId, emailSequenceId, smsCampaignId, status
CampaignAnalytics   — id, campaignId, date, postcardsSent, qrScans, pageVisits, formSubmissions, emailsSent, smsSent
```

### The Updated MCP Tools (by Category)

| Category | Tools | What They Do |
|----------|-------|-------------|
| **Data** (5) | search_data, preview_count, get_sample_data, get_pricing, get_filter_options | Search databases, get counts, preview data, check pricing |
| **Subscriptions** (4) | create_subscription, list_subscriptions, manage_subscription, delivery_report | Set up and manage recurring data delivery |
| **Templates** (4) | browse_templates, upload_template, import_design, generate_postcard_pdf | Browse/create postcard & letter templates, generate PDFs |
| **Delivery** (2) | configure_delivery, get_fulfillment_status | Configure SFTP/print/email delivery, track status |
| **Billing** (4) | create_checkout_session, create_payment_link, get_billing_status, get_billing_portal | Stripe payments, invoices, billing management |
| **Platforms** (2) | configure_platform_connection, sync_to_platform | Connect & sync to Mailchimp, HubSpot, Zapier |
| **Purchases** (1) | purchase_list | One-time data purchases with Stripe payment |
| **Exports** (1) | export_data | Generate CSV/Excel/JSON exports to S3 |
| **Intent** (4) | search_intent_data, list_intent_categories, create_intent_subscription, configure_intent_webhook | Search intent signals, subscribe to real-time alerts |
| **Email** (6) | configure_email_account, create_email_list, create_email_campaign, send_email_campaign, list_email_campaigns, get_email_analytics | Full email marketing via ReachMail |
| **SWOTSPOT** (4) | configure_swotspot, run_local_audit, track_competitor, list_audits | Google Maps competitive intelligence |
| **Discovery** (1) | get_recommendations | AI-powered data product recommendations |
| **Landing Pages** (4) | create_landing_page, list_landing_pages, update_landing_page, delete_landing_page | **NEW** — Build and host lead capture pages |
| **QR Codes** (2) | generate_qr_code, get_qr_scan_analytics | **NEW** — Generate trackable QR codes for print |
| **SMS** (4) | configure_sms_account, send_sms_message, create_sms_campaign, get_sms_analytics | **NEW** — SMS messaging via Twilio |
| **Email Sequences** (4) | create_email_sequence, list_email_sequences, get_sequence_analytics, enroll_in_sequence | **NEW** — Automated drip email campaigns |
| **Campaigns** (5) | create_campaign, list_campaigns, pause_campaign, resume_campaign, cancel_campaign | **NEW** — Multi-channel campaign orchestration |
| **Analytics** (3) | get_campaign_analytics, compare_campaigns, get_roi_report | **NEW** — Cross-channel funnel analytics |

### The 5 Databases

| Database | Description | Key Fields |
|----------|------------|------------|
| **Consumer** | 250M+ US consumers with demographics | Name, address, income, age, home value, dwelling type, children, education, occupation |
| **New Homeowner (NHO)** | People who recently purchased a home | All Consumer fields + move date, purchase date, purchase price |
| **New Mover (NM)** | People who recently moved (buyers + renters) | All Consumer fields + move date |
| **Turning 65** | Consumer demographic: people approaching Medicare eligibility | Consumer fields filtered by age = turning 65 within N months |
| **Intent** | Real-time purchase intent signals from digital behavior | Intent score (1-100), signal category, signal type, contact info, timestamp |

---

## Table of Contents

1. [Overview — What Needs to Be Built](#1-overview)
2. [Current State — What Already Exists](#2-current-state)
3. [Database #1: Consumer Data API](#3-consumer-data-api)
4. [Database #2: New Homeowner (NHO) Data API](#4-nho-data-api)
5. [Database #3: New Mover (NM) Data API](#5-nm-data-api)
6. [Database #4: Turning 65 Data (Consumer Demographic)](#6-turning-65-data)
7. [Database #5: Intent Data (Consumer Demographic)](#7-intent-data)
8. [Subscription API (To Be Built)](#8-subscription-api)
9. [Full-Cycle Marketing Stack (To Be Built)](#9-full-cycle-marketing-stack)
10. [Data Schemas & Types](#10-data-schemas)
11. [Environment Variables](#11-environment-variables)
12. [Files to Modify](#12-files-to-modify)
13. [Testing Checklist](#13-testing-checklist)

---

## 1. Overview

The NHO/NM MCP Server is a Model Context Protocol server (currently **27 tools**, expanding to **~49 tools**) that lets AI assistants (Claude, ChatGPT) help users search, purchase, and subscribe to data from our databases — and ultimately run complete multi-channel marketing campaigns (postcards + landing pages + QR codes + email + SMS) entirely through AI conversation.

**Right now, ALL data calls return mock/fake data.** Tomasz needs to replace the mock data with real API connections to:

| # | Database | API Service File | Status |
|---|----------|------------------|--------|
| 1 | **Consumer** | `src/services/leadsplease-api.ts` | Mock data — needs real API |
| 2 | **New Homeowner (NHO)** | `src/services/leadsplease-api.ts` | Mock data — needs real API |
| 3 | **New Mover (NM)** | `src/services/leadsplease-api.ts` | Mock data — needs real API |
| 4 | **Turning 65** | `src/services/leadsplease-api.ts` | Not yet built — new demographic filter on Consumer DB |
| 5 | **Intent Data** | `src/services/intent-api.ts` | Mock data — needs real API + new demographic on Consumer DB |

Additionally, a **Subscription API** needs to be built to enable recurring data delivery (currently the subscription processor uses `fetchRecordsFromApi()` which returns mock data).

---

## 2. Current State

### 2.1 How the Mock Data Works

The file `src/services/leadsplease-api.ts` has a class `LeadsPleaseApiService` with three methods:

```
searchRecords(params)  → Returns fake names/addresses/demographics
getCount(params)       → Returns fake record counts
getSamples(params)     → Returns fake preview records (no email/phone)
```

It checks `this.useMockData` — if no `LEADSPLEASE_API_KEY` env var is set, it generates fake data. The real API call structure is already stubbed (commented out) at line 257-266.

Similarly, `src/services/intent-api.ts` has `IntentApiClient` with:

```
searchSignals(params)     → Returns fake intent signals
getCategories()           → Returns fake categories
getSignalCount(params)    → Returns fake counts
subscribeToSignals(params)→ Returns fake subscription ID
unsubscribe(id)           → No-op
```

### 2.2 What Calls These Services

The services are called by the MCP tools and the subscription processor:

| Caller | File | Calls |
|--------|------|-------|
| `search_data` tool | `src/tools/data/search-data.ts` | `leadsPleaseApi.searchRecords()` |
| `preview_count` tool | `src/tools/data/preview-count.ts` | `leadsPleaseApi.getCount()` |
| `get_sample_data` tool | `src/tools/data/get-sample-data.ts` | `leadsPleaseApi.getSamples()` |
| `purchase_list` tool | `src/tools/purchases/purchase-list.ts` | `leadsPleaseApi.searchRecords()` |
| `export_data` tool | `src/tools/exports/export-data.ts` | `leadsPleaseApi.searchRecords()` |
| Subscription processor | `src/cron/subscription-processor.ts` | `fetchRecordsFromApi()` (inline mock) |
| `search_intent_data` tool | `src/tools/intent/search-intent-data.ts` | `intentApi.searchSignals()` |
| `list_intent_categories` tool | `src/tools/intent/list-intent-categories.ts` | `intentApi.getCategories()` |
| `create_intent_subscription` tool | `src/tools/intent/create-intent-subscription.ts` | `intentApi.getSignalCount()` |

### 2.3 The Database Type Enum

Defined in `src/utils/validation.ts`:

```typescript
export const DatabaseTypeSchema = z.enum(['nho', 'new_mover', 'consumer', 'business']);
```

And in the Prisma schema (`prisma/schema.prisma`):

```prisma
enum DatabaseType {
  NHO
  NEW_MOVER
  CONSUMER
  BUSINESS
  INTENT
}
```

---

## 3. Consumer Data API

### 3.1 What We Need

An API endpoint that can search the **Consumer database** by:
- **Geography**: ZIP codes, cities, counties, states, radius (lat/lng + miles), or nationwide
- **Demographics**: income range, age range, home value, dwelling type, owner/renter, length of residence, children present, marital status, education, occupation

### 3.2 Required API Methods

#### Search Records
```
POST /api/consumer/search
```
Request body:
```json
{
  "geography": {
    "type": "zip",           // zip | city | county | state | radius | nationwide
    "values": ["85001", "85002"],  // array of values (not needed for nationwide)
    "center": { "lat": 33.45, "lng": -112.07 },  // only for radius
    "radiusMiles": 25        // only for radius
  },
  "filters": {
    "income": { "min": 50000, "max": 150000 },
    "age": { "min": 25, "max": 65 },
    "homeValue": { "min": 200000, "max": 500000 },
    "dwellingType": ["single_family", "condo"],
    "hasChildren": true,
    "ownerOccupied": true,
    "lengthOfResidence": { "minMonths": 12, "maxMonths": 60 }
  },
  "includeEmail": true,
  "includePhone": false,
  "limit": 100,
  "offset": 0
}
```

Response:
```json
{
  "records": [
    {
      "id": "unique-record-id",
      "firstName": "John",
      "lastName": "Smith",
      "address": {
        "street": "123 Main St",
        "city": "Phoenix",
        "state": "AZ",
        "zip": "85001",
        "zip4": "1234"
      },
      "email": "john.smith@email.com",
      "phone": null,
      "demographics": {
        "estimatedIncome": "$75,000 - $99,999",
        "estimatedAge": "45-54",
        "homeValue": "$300,000 - $399,999",
        "dwellingType": "Single Family",
        "ownerOccupied": true,
        "lengthOfResidence": "36 months",
        "hasChildren": true
      },
      "recordType": "consumer",
      "dataDate": "2026-02-15"
    }
  ],
  "total": 15432
}
```

#### Get Count (Preview)
```
POST /api/consumer/count
```
Same request body as search (minus limit/offset/includeEmail/includePhone).
Response:
```json
{
  "total_available": 15432,
  "estimated_weekly": 1234,
  "estimated_monthly": 5300,
  "geography_summary": "ZIP Codes: 85001, 85002",
  "filters_applied": true
}
```

#### Get Samples
```
POST /api/consumer/samples
```
Returns 5-10 records WITHOUT email/phone (free preview for users to verify data quality).

### 3.3 Where to Implement

Replace mock data in `src/services/leadsplease-api.ts`:

1. In `searchRecords()` method (line 243-273): Replace the commented-out fetch call with the real Consumer API call when `params.database === 'consumer'`
2. In `getCount()` method (line 278-293): Same pattern
3. In `getSamples()` method (line 298-313): Same pattern

---

## 4. NHO (New Homeowner) Data API

### 4.1 What We Need

An API endpoint that searches the **New Homeowner database** — people who recently purchased a home. Same geography and demographic filters as Consumer, PLUS:

- **Purchase date range**: filter by when the home was purchased
- **Purchase price range**: filter by purchase price

### 4.2 Additional Fields in Response

NHO records include extra fields not present in Consumer:

```json
{
  "moveDate": "2026-01-15",
  "purchaseDate": "2026-01-10",
  "purchasePrice": 425000
}
```

### 4.3 Required API Methods

Same three methods as Consumer:
```
POST /api/nho/search
POST /api/nho/count
POST /api/nho/samples
```

With additional filter parameters:
```json
{
  "filters": {
    "moveDate": { "from": "2026-01-01T00:00:00Z", "to": "2026-02-20T00:00:00Z" },
    "purchaseDate": { "from": "2026-01-01T00:00:00Z", "to": "2026-02-20T00:00:00Z" },
    "purchasePrice": { "min": 200000, "max": 500000 }
  }
}
```

### 4.4 Where to Implement

Same file `src/services/leadsplease-api.ts` — the `searchRecords()` method receives `params.database` which will be `'nho'`. Route to the NHO API endpoint based on database type.

---

## 5. NM (New Mover) Data API

### 5.1 What We Need

An API endpoint that searches the **New Mover database** — people who recently moved (may not have purchased, could be renters too).

Same geography + demographic filters as Consumer, PLUS:
- **Move date range**: filter by when they moved

### 5.2 Additional Fields in Response

```json
{
  "moveDate": "2026-02-01"
}
```

(No `purchaseDate` or `purchasePrice` — that's NHO only.)

### 5.3 Required API Methods

```
POST /api/new-mover/search
POST /api/new-mover/count
POST /api/new-mover/samples
```

### 5.4 Where to Implement

Same file `src/services/leadsplease-api.ts` — when `params.database === 'new_mover'`, route to the NM API endpoint.

---

## 6. Turning 65 Data (Consumer Demographic — TO BE BUILT)

### 6.1 What This Is

"Turning 65" is NOT a separate database — it's a **demographic filter on the Consumer database** that identifies people who are turning 65 within a specified time window.

This is valuable for insurance companies (Medicare eligibility), financial advisors (retirement planning), and healthcare providers.

### 6.2 What Needs to Be Built

#### Option A: Server-Side Filter
If the Consumer API supports age filtering with sufficient precision (exact birth year/month), we can filter server-side:
```json
{
  "database": "consumer",
  "filters": {
    "age": { "min": 64, "max": 65 },
    "turningAge": {
      "age": 65,
      "withinMonths": 6
    }
  }
}
```

#### Option B: Dedicated API Endpoint
If the Consumer database has a separate index or view for Turning 65:
```
POST /api/consumer/turning-65
```
Request:
```json
{
  "geography": { "type": "state", "values": ["AZ", "CA"] },
  "turningWithinMonths": 6,
  "includeEmail": true,
  "includePhone": true,
  "limit": 100
}
```

### 6.3 What Tomasz Needs to Decide

1. Does the Consumer database store exact birth dates or just age ranges?
2. If birth dates: can we compute "turning 65 within N months" server-side?
3. If age ranges only: do we need a separate Turning 65 data feed?
4. Should this be a new value in the `DatabaseType` enum (e.g., `TURNING_65`) or a filter flag?

### 6.4 Where to Implement

- If it's a filter: add `turningAge` parameter to `DemographicFiltersSchema` in `src/utils/validation.ts` (line 135-148) and handle it in `leadsplease-api.ts`
- If it's a new database type: add `'turning_65'` to `DatabaseTypeSchema` in `src/utils/validation.ts` (line 16) and add `TURNING_65` to the Prisma enum

---

## 7. Intent Data (Consumer Demographic — TO BE BUILT)

### 7.1 What This Is

Intent Data identifies consumers who are **actively showing purchase intent** — browsing for products, comparing services, filling out forms — based on digital behavior signals.

This is a **propensity scoring system** built on top of the Consumer database. Each consumer gets an intent score (1-100) and categorized purchase intent signals.

### 7.2 Current Mock Structure

The intent system is already defined with 8 parent categories and 46 subcategories in `src/schemas/intent.ts`:

| Category | Subcategories |
|----------|--------------|
| Automotive | Vehicle purchase, lease, refinance, insurance, service, parts |
| Home & Real Estate | Home purchase, refinance, improvement, insurance, security, solar, HVAC, roofing, landscaping |
| Financial Services | Credit cards, personal loans, debt consolidation, investment, retirement, life/health insurance |
| Education | College, online degree, certifications, coding bootcamp, MBA |
| Telecom | Mobile, internet, cable, streaming |
| Healthcare | Dental, vision, cosmetic, weight loss, mental health, senior care |
| Travel | Vacation, cruise, hotels, flights, car rental |
| Business Services | Software, office supplies, professional services, commercial insurance/real estate |

### 7.3 What the Real API Needs to Provide

#### Search Intent Signals
```
POST /api/intent/signals/search
```
Request:
```json
{
  "categories": ["home_purchase", "home_refinance"],
  "geography": { "type": "state", "values": ["AZ", "CA"] },
  "filters": {
    "minIntentScore": 70,
    "signalTypes": ["search", "form_submit"],
    "maxAgeHours": 48,
    "requireEmail": true,
    "requirePhone": false,
    "requireAddress": true
  },
  "limit": 100,
  "offset": 0
}
```
Response:
```json
{
  "signals": [
    {
      "id": "sig_abc123",
      "category": "home_purchase",
      "intentScore": 85,
      "signalType": "form_submit",
      "signalSource": "google_ads",
      "signalTimestamp": "2026-02-20T10:30:00Z",
      "email": "jane.smith@email.com",
      "phone": "555-123-4567",
      "firstName": "Jane",
      "lastName": "Smith",
      "address": "456 Oak Ave",
      "city": "Scottsdale",
      "state": "AZ",
      "zip": "85251"
    }
  ],
  "total": 342,
  "hasMore": true
}
```

#### Get Categories
```
GET /api/intent/categories
```
Returns the category tree with availability info and pricing.

#### Get Signal Count
```
POST /api/intent/signals/count
```
Returns counts per category and estimated monthly volume.

#### Subscribe to Signals (Real-Time)
```
POST /api/intent/subscriptions
```
Registers a webhook to receive signals in real time.

#### Unsubscribe
```
DELETE /api/intent/subscriptions/{subscriptionId}
```

### 7.4 The Consumer Database Connection

Intent Data needs to be linked to the Consumer database so that:

1. When a user searches Consumer data, they can optionally filter by intent signals (e.g., "consumers in AZ with home_purchase intent score > 70")
2. Intent signals are enriched with full Consumer demographics (income, home value, etc.)
3. The Turning 65 demographic can be combined with intent (e.g., "people turning 65 who show health_insurance intent")

### 7.5 Where to Implement

- Replace mock data in `src/services/intent-api.ts` (all 5 methods)
- Add intent score as an optional filter in the Consumer search API
- The intent schemas are already defined in `src/schemas/intent.ts` — the data structures are ready

### 7.6 Pricing Structure (Already Defined)

From `src/schemas/intent.ts` — three tiers:
- **Standard**: $299/mo base, $0.50/signal, 500 included
- **Professional**: $799/mo base, $0.35/signal, 2,000 included
- **Enterprise**: $1,999/mo base, $0.25/signal, 10,000 included

Category premiums apply (e.g., home_purchase is 2x, b2b_software is 2.5x).

---

## 8. Subscription API (To Be Built)

### 8.1 What This Is

The Subscription API enables **recurring automated data delivery**. Users set up a subscription once, and the system automatically:

1. Queries the database on a schedule (daily/weekly/biweekly/monthly)
2. Deduplicates against previously delivered records
3. Generates output files (CSV, Excel, PDF postcards)
4. Delivers via the configured method (download, email, SFTP, print fulfillment, webhook)
5. Syncs to connected platforms (Mailchimp, HubSpot, Zapier)

### 8.2 Current State

The subscription infrastructure already exists in the codebase:

| Component | File | Status |
|-----------|------|--------|
| Prisma model | `prisma/schema.prisma` (DataSubscription) | Done |
| Create subscription tool | `src/tools/subscriptions/create-subscription.ts` | Done |
| List subscriptions tool | `src/tools/subscriptions/list-subscriptions.ts` | Done |
| Manage subscription tool | `src/tools/subscriptions/manage-subscription.ts` | Done |
| Delivery report tool | `src/tools/subscriptions/delivery-report.ts` | Done |
| Subscription processor (cron) | `src/cron/subscription-processor.ts` | **Uses mock data** |
| Deduplication service | `src/services/deduplication.ts` | Done |
| PDF generator | `src/services/pdf-generator.ts` | Done |
| SFTP delivery | `src/services/sftp-delivery.ts` | Done |
| Print API providers | `src/services/print-api/` (Lob, PostGrid, Stannp, Reminder Media) | Done |
| Platform sync | `src/services/platform-sync/` (Mailchimp, HubSpot, Zapier) | Done |

### 8.3 What Needs to Change

The file `src/cron/subscription-processor.ts` has an inline function `fetchRecordsFromApi()` (line 64-120) that generates mock data. This needs to be replaced with a call to the real LeadsPlease API.

**The fix is straightforward:**

```typescript
// BEFORE (mock):
async function fetchRecordsFromApi(database, geography, filters) {
  // generates fake records
}

// AFTER (real):
import { leadsPleaseApi } from '../services/leadsplease-api.js';

async function fetchRecordsFromApi(database, geography, filters) {
  const result = await leadsPleaseApi.searchRecords({
    database,
    geography,
    filters,
    limit: 10000,  // or subscription's configured limit
    offset: 0,
    includeEmail: true,  // based on subscription config
    includePhone: true,
  });
  return result.records;
}
```

### 8.4 Subscription Data Model (Already in Prisma)

```
DataSubscription:
  - id, tenantId, name
  - database: DatabaseType (NHO, NEW_MOVER, CONSUMER, BUSINESS, INTENT)
  - geography: JSON  (type + values)
  - filters: JSON (demographic filters)
  - frequency: DAILY | WEEKLY | BIWEEKLY | MONTHLY
  - fulfillmentMethod: DOWNLOAD | EMAIL | PRINT_MAIL | WEBHOOK | FTP
  - templateId (for print fulfillment)
  - deduplicationEnabled: boolean
  - deduplicationWindowDays: int
  - syncChannels: String[] (e.g., ["mailchimp", "hubspot"])
  - status: ACTIVE | PAUSED | CANCELLED | EXPIRED
  - nextDeliveryAt: DateTime
  - lastDeliveryAt: DateTime
```

### 8.5 The Subscription API Endpoints (To Be Built)

These REST endpoints need to be created for external (non-MCP) integrations:

```
POST   /api/subscriptions              Create a new subscription
GET    /api/subscriptions              List subscriptions (with pagination)
GET    /api/subscriptions/:id          Get subscription details
PUT    /api/subscriptions/:id          Update subscription
DELETE /api/subscriptions/:id          Cancel subscription
POST   /api/subscriptions/:id/pause    Pause subscription
POST   /api/subscriptions/:id/resume   Resume subscription
GET    /api/subscriptions/:id/deliveries  List delivery history
```

**Note:** The MCP tools for subscriptions already exist (`create_subscription`, `list_subscriptions`, `manage_subscription`, `delivery_report`). The REST API would be for direct HTTP integrations.

---

## 9. Full-Cycle Marketing Stack (To Be Built)

This section describes the new services and infrastructure needed to support the full-cycle marketing functions (Functions 14-20 above). These are **Phase 2 features** — the API connections in Sections 3-8 are Phase 1 priority.

### 9.1 Landing Page Service

**What it does:** Generates, hosts, and manages lead capture landing pages.

**Architecture:**
- Landing pages are generated as static HTML from templates (similar to postcard templates)
- Hosted on Cloudflare Workers/Pages or S3 + CloudFront
- Form submissions POST to our API endpoint (`/api/pages/:pageId/submit`)
- Responses stored in PostgreSQL (new `LandingPageResponse` model)

**New files to create:**
```
src/services/landing-page/builder.ts      — HTML template engine for pages
src/services/landing-page/hosting.ts      — Deploy page to hosting (Workers/S3)
src/services/landing-page/forms.ts        — Form submission handler
src/tools/landing-pages/create-landing-page.ts
src/tools/landing-pages/list-landing-pages.ts
src/tools/landing-pages/update-landing-page.ts
src/tools/landing-pages/delete-landing-page.ts
src/api/routes/landing-pages.ts           — REST API for form submissions
```

**Environment variables:**
```env
LANDING_PAGE_DOMAIN=pages.leadsplease.com     # or custom domain
LANDING_PAGE_BUCKET=leadsplease-landing-pages  # S3 bucket for hosting
```

### 9.2 QR Code Service

**What it does:** Generates static and dynamic QR codes with optional branding, and tracks scans.

**Architecture:**
- QR generation via `qrcode` npm package (free, no API key needed)
- Branded QR codes via `qr-image` or canvas manipulation
- Dynamic QR codes use a redirect URL: `qr.leadsplease.com/abc123` → actual destination
- Redirect endpoint logs scan analytics (IP, user agent, timestamp)
- QR code images stored in S3

**New files to create:**
```
src/services/qr-code/generator.ts         — QR image generation
src/services/qr-code/tracking.ts          — Redirect service + scan analytics
src/tools/qr-codes/generate-qr-code.ts
src/tools/qr-codes/get-qr-scan-analytics.ts
src/api/routes/qr-redirect.ts             — GET /q/:code redirect endpoint
```

**No external API needed** — QR generation is done locally with npm packages.

### 9.3 SMS Service (Twilio)

**What it does:** Sends individual and bulk SMS messages with delivery tracking and opt-out management.

**Architecture:**
- Twilio REST API for sending SMS
- Twilio webhook for delivery receipts and inbound messages (STOP handling)
- Phone number validation before sending
- Opt-out list stored in PostgreSQL

**New files to create:**
```
src/services/sms/twilio-client.ts         — Twilio API wrapper
src/services/sms/opt-out.ts               — Opt-out list management
src/services/sms/campaign.ts              — Bulk SMS with rate limiting
src/tools/sms/configure-sms-account.ts
src/tools/sms/send-sms-message.ts
src/tools/sms/create-sms-campaign.ts
src/tools/sms/get-sms-analytics.ts
src/api/routes/sms-webhook.ts             — Twilio status callback
```

**Environment variables:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
TWILIO_WEBHOOK_URL=https://api.leadsplease.com/webhooks/twilio
```

**Estimated cost:** $0.0079/SMS sent + $0.0079/SMS received + $1.15/mo phone number

### 9.4 Email Sequence Service

**What it does:** Manages multi-step automated email drip campaigns with time delays.

**Architecture:**
- Sequences stored in PostgreSQL with step definitions (delay, subject, body)
- Cron job checks for due sequence steps (similar to subscription processor)
- Uses existing ReachMail integration for actual email sending
- Enrollment tracking: which contact is at which step, paused, completed, etc.

**New files to create:**
```
src/services/email-sequences/scheduler.ts  — Step timing and execution
src/services/email-sequences/enrollment.ts — Contact enrollment management
src/cron/sequence-processor.ts             — Cron job for due steps
src/tools/email-sequences/create-email-sequence.ts
src/tools/email-sequences/list-email-sequences.ts
src/tools/email-sequences/get-sequence-analytics.ts
src/tools/email-sequences/enroll-in-sequence.ts
```

**No new API needed** — uses existing ReachMail integration for sending.

### 9.5 Campaign Orchestration Service

**What it does:** Ties all channels together into a unified campaign object.

**Architecture:**
- A `Campaign` model links: data subscription + landing page + QR code + email sequence + SMS campaign
- Campaign creation orchestrates all sub-services in sequence
- Unified analytics aggregated from all channel-specific analytics
- Campaign lifecycle management (active, paused, completed, cancelled)

**New files to create:**
```
src/services/campaigns/orchestrator.ts     — Campaign creation pipeline
src/services/campaigns/analytics.ts        — Cross-channel analytics aggregation
src/tools/campaigns/create-campaign.ts
src/tools/campaigns/list-campaigns.ts
src/tools/campaigns/pause-campaign.ts
src/tools/campaigns/resume-campaign.ts
src/tools/campaigns/cancel-campaign.ts
src/tools/campaigns/get-campaign-analytics.ts
src/tools/campaigns/compare-campaigns.ts
src/tools/campaigns/get-roi-report.ts
```

### 9.6 Implementation Priority

| Phase | Features | Effort | Depends On |
|-------|----------|--------|-----------|
| **Phase 1** (Current) | Real API connections for 5 databases + Subscription API | 4-6 weeks | LeadsPlease API access |
| **Phase 2A** | Landing pages + QR codes | 2-3 weeks | Phase 1 (needs real data) |
| **Phase 2B** | SMS integration (Twilio) | 1-2 weeks | Twilio account |
| **Phase 2C** | Email drip sequences | 2-3 weeks | Phase 1 (ReachMail working) |
| **Phase 3** | Campaign orchestration + unified analytics | 2-3 weeks | Phases 2A-2C |

---

## 10. Data Schemas & Types

### 9.1 Geography (already defined in `src/utils/validation.ts`)

```typescript
type Geography = {
  type: 'zip' | 'city' | 'county' | 'state' | 'radius' | 'nationwide';
  values?: string[];          // Required for zip/city/county/state
  center?: { lat: number; lng: number };  // Required for radius
  radiusMiles?: number;       // Required for radius (1-100)
};
```

### 9.2 Demographic Filters (already defined in `src/utils/validation.ts`)

```typescript
type DemographicFilters = {
  income?: { min?: number; max?: number };
  age?: { min?: number; max?: number };
  homeValue?: { min?: number; max?: number };
  moveDate?: { from?: string; to?: string };      // ISO datetime
  purchaseDate?: { from?: string; to?: string };   // ISO datetime
  dwellingType?: ('single_family' | 'condo' | 'townhouse' | 'multi_family' | 'apartment' | 'mobile_home')[];
  hasChildren?: boolean;
  ownerOccupied?: boolean;
  lengthOfResidence?: { minMonths?: number; maxMonths?: number };
};
```

### 9.3 Data Record (already defined in `src/utils/validation.ts`)

```typescript
type DataRecord = {
  id: string;
  firstName: string;
  lastName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    zip4?: string;
  };
  email?: string;             // Only if includeEmail
  phone?: string;             // Only if includePhone
  demographics?: {
    estimatedIncome?: string;
    estimatedAge?: string;
    homeValue?: string;
    dwellingType?: string;
    ownerOccupied?: boolean;
    lengthOfResidence?: string;
    hasChildren?: boolean;
  };
  moveDate?: string;          // NHO and NM only
  purchaseDate?: string;      // NHO only
  purchasePrice?: number;     // NHO only
  recordType: 'nho' | 'new_mover' | 'consumer' | 'business';
  dataDate: string;           // When record was sourced
};
```

### 9.4 Intent Signal (already defined in `src/schemas/intent.ts`)

```typescript
type IntentSignal = {
  id: string;
  category: string;
  intentScore: number;        // 1-100
  signalType: 'search' | 'click' | 'form_submit' | 'comparison' | 'review' | 'purchase_abandon';
  signalSource?: string;      // e.g., "google_ads"
  signalTimestamp: string;    // ISO datetime
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};
```

---

## 11. Environment Variables

### Required (set these to enable real API connections)

```env
# LeadsPlease Data API (Consumer, NHO, NM databases)
LEADSPLEASE_API_URL=https://api.leadsplease.com/v1
LEADSPLEASE_API_KEY=your-api-key-here

# Intent Data API
INTENT_API_URL=https://api.intentdata.example.com/v1
INTENT_API_KEY=your-intent-api-key-here
```

### What Happens When You Set Them

- `leadsplease-api.ts` line 230: checks `!this._apiKey || this._apiKey === 'your-leadsplease-api-key'` — if truthy, uses mock data
- `intent-api.ts` line 23: checks `!INTENT_API_KEY || process.env.USE_MOCK_INTENT_DATA === 'true'` — if truthy, uses mock data

Once you set real API keys, the mock data is automatically bypassed.

### All Environment Variables (Reference)

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/nho_nm_production

# Data APIs
LEADSPLEASE_API_URL=https://api.leadsplease.com/v1
LEADSPLEASE_API_KEY=real-key
INTENT_API_URL=https://api.intentdata.example.com/v1
INTENT_API_KEY=real-key

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=nho-nm-exports

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

---

## 12. Files to Modify

### Priority 1: Replace Mock Data with Real APIs

| File | What to Change |
|------|---------------|
| `src/services/leadsplease-api.ts` | Replace `mockSearchRecords()`, `mockGetCount()`, `mockGetSamples()` with real API calls. Route by `params.database` to the correct endpoint (Consumer, NHO, NM). |
| `src/services/intent-api.ts` | Replace all 5 mock methods (`mockSearchSignals()`, `mockGetCategories()`, `mockGetSignalCount()`) with real API calls. |
| `src/cron/subscription-processor.ts` | Replace `fetchRecordsFromApi()` (line 64) with a call to `leadsPleaseApi.searchRecords()`. |

### Priority 2: Add Turning 65 Demographic

| File | What to Change |
|------|---------------|
| `src/utils/validation.ts` | Add `turningAge` filter to `DemographicFiltersSchema` (or add `'turning_65'` to `DatabaseTypeSchema`) |
| `src/services/leadsplease-api.ts` | Handle the Turning 65 filter/database type in search methods |
| `prisma/schema.prisma` | Add `TURNING_65` to `DatabaseType` enum if it's a separate database type |

### Priority 3: Build Subscription REST API

| File | What to Create |
|------|---------------|
| `src/api/routes/subscriptions.ts` | New REST endpoints for subscription CRUD |
| `src/api/middleware/` | Auth middleware for the REST API (API key or JWT) |

### Priority 4: Intent + Consumer Cross-Reference

| File | What to Change |
|------|---------------|
| `src/services/leadsplease-api.ts` | Add optional `intentScore` filter parameter to Consumer search |
| `src/utils/validation.ts` | Add `intentScore` to `DemographicFiltersSchema` |

---

## 13. Testing Checklist

### Consumer Database
- [ ] `search_data` with `database: "consumer"` returns real records
- [ ] `preview_count` with `database: "consumer"` returns accurate counts
- [ ] `get_sample_data` with `database: "consumer"` returns preview records
- [ ] Geography filters work: ZIP, city, county, state, radius, nationwide
- [ ] Demographic filters work: income, age, home value, dwelling type, children, owner
- [ ] Email append works (records include email when requested)
- [ ] Phone append works (records include phone when requested)

### NHO Database
- [ ] `search_data` with `database: "nho"` returns records with `moveDate`, `purchaseDate`, `purchasePrice`
- [ ] Move date filter works
- [ ] Purchase date filter works
- [ ] Purchase price filter works (if supported)

### NM Database
- [ ] `search_data` with `database: "new_mover"` returns records with `moveDate`
- [ ] Move date filter works

### Turning 65
- [ ] Can filter Consumer data for people turning 65 within N months
- [ ] Returns accurate counts
- [ ] Works with other demographic filters combined

### Intent Data
- [ ] `search_intent_data` returns real signals with scores
- [ ] `list_intent_categories` returns real categories
- [ ] Category filtering works
- [ ] Geography filtering works
- [ ] Intent score minimum filter works
- [ ] Signal type filter works
- [ ] Recency filter (`maxAgeHours`) works
- [ ] Email/phone/address requirement filters work
- [ ] Can cross-reference intent with Consumer demographics

### Subscriptions
- [ ] Subscription processor fetches real data (not mock)
- [ ] Deduplication works against previously delivered records
- [ ] PDF postcard generation works with real data
- [ ] SFTP delivery works
- [ ] Print fulfillment works (at least one provider)
- [ ] Platform sync works (Mailchimp, HubSpot)

### REST API (if built)
- [ ] POST /api/subscriptions creates a subscription
- [ ] GET /api/subscriptions lists with pagination
- [ ] PUT /api/subscriptions/:id updates
- [ ] DELETE /api/subscriptions/:id cancels
- [ ] Pause/resume endpoints work
- [ ] Delivery history endpoint returns data

---

## Summary of What Tomasz Needs to Provide

1. **Consumer/NHO/NM API credentials** — URL + API key for the LeadsPlease databases
2. **API documentation** — Swagger/OpenAPI spec or request/response examples
3. **Intent Data API credentials** — URL + API key for the intent signal provider
4. **Turning 65 approach** — Is it a filter on Consumer or a separate data feed?
5. **Database field mapping** — How do the API response fields map to our `DataRecord` type?
6. **Rate limits** — What are the API rate limits per second/minute/hour?
7. **Test environment** — Sandbox URLs and test keys for development

---

## Questions for Tomasz

1. Are Consumer, NHO, and NM separate API endpoints or one endpoint with a database type parameter?
2. Does the Consumer API support exact birth date filtering (needed for Turning 65)?
3. Is the Intent Data from a third-party provider or an internal system?
4. What authentication method does the API use? (Bearer token, API key header, OAuth?)
5. Are there webhook capabilities for real-time new record notifications?
6. What's the maximum batch size per API call?
7. Is there a sandbox/staging environment for testing?
