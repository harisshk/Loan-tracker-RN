/**
 * Simple GitHub Gist Sync Utility
 * Allows backing up and restoring loan data using a GitHub Personal Access Token (classic or fine-grained)
 */

const GIST_FILENAME = 'loan-tracker-backup.json';
const GIST_DESCRIPTION = 'Loan Tracker Backup (Automated)';

/**
 * Uploads data to a GitHub Gist
 * @param {string} token GitHub Personal Access Token
 * @param {string} data JSON string of statistics and loans
 */
export async function syncToCloud(token, data) {
  try {
    // 1. Check if a gist with our filename already exists
    const gistsResponse = await fetch('https://api.github.com/gists', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!gistsResponse.ok) {
      throw new Error(`GitHub API Error: ${gistsResponse.statusText}`);
    }

    const gists = await gistsResponse.json();
    const existingGist = gists.find(g => g.files[GIST_FILENAME]);

    if (existingGist) {
      // 2. Update existing gist
      const updateResponse = await fetch(`https://api.github.com/gists/${existingGist.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          files: {
            [GIST_FILENAME]: {
              content: data,
            },
          },
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update existing backup');
      }
      return await updateResponse.json();
    } else {
      // 3. Create new private gist
      const createResponse = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          public: false,
          files: {
            [GIST_FILENAME]: {
              content: data,
            },
          },
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create new backup');
      }
      return await createResponse.json();
    }
  } catch (error) {
    console.error('Cloud Sync Error:', error);
    throw error;
  }
}

/**
 * Downloads data from the latest GitHub Gist backup
 * @param {string} token GitHub Personal Access Token
 */
export async function restoreFromCloud(token) {
  try {
    const gistsResponse = await fetch('https://api.github.com/gists', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!gistsResponse.ok) {
      throw new Error(`GitHub API Error: ${gistsResponse.statusText}`);
    }

    const gists = await gistsResponse.json();
    const backupGist = gists.find(g => g.files[GIST_FILENAME]);

    if (!backupGist) {
      throw new Error('No backup found on this GitHub account.');
    }

    // Fetch the raw content
    const rawUrl = backupGist.files[GIST_FILENAME].raw_url;
    const contentResponse = await fetch(rawUrl, {
      headers: {
        Authorization: `token ${token}`,
      }
    });

    if (!contentResponse.ok) {
      throw new Error('Failed to download backup content');
    }

    return await contentResponse.text();
  } catch (error) {
    console.error('Cloud Restore Error:', error);
    throw error;
  }
}
