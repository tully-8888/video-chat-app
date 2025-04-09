# GitHub Repository Setup Instructions

1. Go to your GitHub repository at: https://github.com/TopNotchCo/video-chat-app
2. Click on "Settings" in the top navigation
3. In the left sidebar, click on "Branches"
4. Under "Default branch", click on the dropdown that currently shows "main"
5. Select "new-main" from the dropdown
6. Click on "Update" to confirm the change
7. You'll see a warning that changing the default branch can be destructive - click "I understand, update the default branch"

Once you've done this, you should:

1. Delete the old main branch:
   - From your local repository: `git branch -d main`
   - From GitHub: `git push origin --delete main`

Now the repository will use the clean "new-main" branch as the default, without the large node_modules files that were causing issues. 