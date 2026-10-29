# Firm Title TB blog

The blog at <https://firmtitletb.com/blog> is written in a Google Sheet. A GitHub
Actions workflow (`.github/workflows/generate-blog.yml`) reads the sheet every hour
from 6 AM to 11 PM Eastern, rebuilds the blog pages with `generate-blog.js`, and
publishes them. To publish right away, open the repository's **Actions** tab,
choose **Generate Blog from Google Sheet**, and click **Run workflow**.

## Writing a post

One row per post. Row 1 holds the column names; the columns can be in any order.

| Column    | Required | Notes |
|-----------|----------|-------|
| Title     | yes      | The headline. Make it descriptive: it is what Google shows. |
| Slug      | yes      | The web address: `closing-costs-explained` becomes `/blog/closing-costs-explained`. Letters, numbers and dashes. Don't change it after publishing, or old links break. |
| Content   | yes      | The post. A blank line starts a new paragraph. `**bold**`, `[link text](https://…)`, plain `https://` links, `## Heading` and `- ` bullet lines all work. |
| Date      | yes      | Publish date. A future date schedules the post: it goes live that morning. |
| Published | yes      | Tick the checkbox (or type TRUE) to publish. Untick to take a post down. |
| Excerpt   | no       | One or two sentences shown on the blog page and in Google and social previews. |
| Image     | no       | An `https://` image link. Google Drive share links work if the image is shared publicly. |
| Category  | no       | e.g. *Closings*, *Development Update*, *Title Tips*. Adds filter buttons to the blog page. |
| Author    | no       | Defaults to Firm Title TB. |

Deleting a row, or unticking **Published**, removes the post on the next run. As a
safety net, a run that would remove more than half the posts stops instead; if that
is really what you want, use **Run workflow** with *Allow removing more than half
of the live posts* ticked.

## Who can write, edit and delete posts

Anyone who can **edit the Google Sheet** can publish, change or delete posts, so the
sheet's sharing list is the access list. To keep that to Firm Title TB staff:

1. **Share the sheet only with named staff as Editors.** In the sheet, click
   **Share**. Under *General access*, choose **Restricted**, not "Anyone with the
   link". Remove anyone who shouldn't post.
2. **Let the website read the sheet privately** with a read-only Google service
   account, so drafts are never visible to the public:
   1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick)
      a project and enable the **Google Sheets API**.
   2. Under **IAM & Admin → Service Accounts**, create a service account (no roles
      needed). Open it, go to **Keys → Add key → Create new key → JSON**, and
      download the file.
   3. In the sheet, click **Share** and add the service account's email
      (`…@….iam.gserviceaccount.com`) as a **Viewer**. Viewer is read-only: the
      website can never change the sheet.
   4. In GitHub, go to **Settings → Secrets and variables → Actions** and add a
      secret named `GOOGLE_SERVICE_ACCOUNT_JSON` containing the whole JSON file.
      `GOOGLE_SHEET_ID` (and optionally `GOOGLE_SHEET_NAME`) stay as they are.
   5. Run the workflow once to confirm it works, then make sure the sheet's
      *General access* is **Restricted**.
3. **Limit who can change the website code.** Only people with write access to
   this GitHub repository can change how the blog is built. Review the list under
   **Settings → Collaborators**.

Until step 2 is done, the workflow reads the sheet through its public link and the
run log shows a warning saying so.

**Audit trail:** Google Sheets keeps a full edit history (**File → Version
history**), showing who changed what. Each automatic website update is also
recorded as a commit listing the posts that were added, updated or removed.

## Working on the generator

```bash
node --test scripts/generate-blog.test.js
```

To preview locally without the sheet, put rows in a JSON file (an array of objects
keyed by column name) and run:

```bash
BLOG_SOURCE_FILE=posts.json node scripts/generate-blog.js
python3 -m http.server 8000
```

Then open <http://localhost:8000/blog/>. Styles live in `scripts/blog.css`; the
generator copies them to `/blog/blog.css`.
