# iPhone Shortcut and NFC setup

The private NFC tag triggers a personal iPhone automation; it does not store a URL or token. The public House and Car tags contain only permanent web addresses.

## Build the “Update Spotify Jam” Shortcut

In Shortcuts, create a new shortcut named **Update Spotify Jam** and add these actions in order:

1. **Get Clipboard**.
2. **Set Variable**: name it `JamURL` and set it to Clipboard.
3. Add **Match Text** with pattern `https://([^/]+\.)?(spotify\.com|spotify\.link)/` and input `JamURL`. Add **If** Matched Text does not have any value: show **Clipboard does not contain a Spotify link**, then add **Stop This Shortcut**. This is only quick phone-side feedback; the Worker performs the security validation.
4. **Choose from Menu** with two items: **House** and **Car**.
5. In **House**, use a **Text** action containing `https://paulpoleon-spotify-jam.paulpoleon.workers.dev/api/jam/house`, then **Set Variable** `Endpoint` to that text and **Set Variable** `JamName` to `House`.
6. In **Car**, use a **Text** action containing `https://paulpoleon-spotify-jam.paulpoleon.workers.dev/api/jam/car`, then **Set Variable** `Endpoint` to that text and set `JamName` to `Car`.
7. After the menu, add **Get Contents of URL** using `Endpoint`:
   - Method: **POST**
   - Headers: `Authorization` = `Bearer YOUR_ADMIN_TOKEN`
   - Request Body: **JSON**
   - Add text field `url` with value `JamURL`
8. Add **Get Dictionary Value** for key `success` from the result.
9. **If** that value is true, **Show Notification** with `JamName Jam Updated`. Otherwise, **Show Alert** with `Jam update failed. Check the link and try again.`

Use the exact deployed Worker URL shown above in both menu branches. Replace `YOUR_ADMIN_TOKEN` with the same strong token stored as the Worker's `ADMIN_TOKEN` secret; keep it only inside your private Shortcut.

Before adding NFC automation, run the Shortcut manually with a real Spotify Jam invite in the clipboard. Test House and Car separately, then tap each public URL to confirm it joins the correct Jam.

## Attach the private NFC trigger

On the personal iPhone:

1. Open **Shortcuts → Automation → +**.
2. Choose **NFC**, then scan and name the private admin NFC tag.
3. Select **Run Immediately** and disable **Notify When Run** if iOS offers that option and you do not want the extra notification.
4. Add **Run Shortcut** and choose **Update Spotify Jam**.
5. Save the automation.

The working routine is: start/create a Jam in Spotify → copy its invite URL → tap the private admin tag → choose House or Car → wait for confirmation.

## Security

- Keep the admin NFC tag and Shortcut private. The token necessarily exists on the personal iPhone.
- Never share or export the Shortcut with the real token still inside it.
- Never write the token or Worker admin endpoint to either public tag.
- If the phone or token is compromised, run `npx wrangler secret put ADMIN_TOKEN` with a new token and update the Shortcut immediately.

## Public NFC contents

- House tag: `https://paulpoleon.com/jam`
- Car tag: `https://paulpoleon.com/carjam`

These are the only values written to the public tags and should never need changing.
