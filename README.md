# MISTIZEN

## How the project is organized

### Frontend (runs in the browser)

- `Frontend.html`, `PRODUCTS.html`, `cart.html`, `checkout.html`, and `auth.html` provide the page structure.
- `Frontend.css` defines the shared visual system, responsive product grid, animations, and light theme.
- `script.js` adds interaction: product galleries, quantities, navigation, local cart storage, currency conversion, authentication requests, and checkout form behavior.
- The cart and currency selection are saved in `localStorage`, so they remain available while the shopper moves between pages in the same browser.

### Backend (runs on the server)

- `app.py` is a Flask server. It serves pages/assets and exposes JSON API endpoints for authentication, carts, orders, CSRF tokens, and exchange rates.
- `mistizen.db` is the SQLite database. It stores users, server-side carts, cart items, and created orders.
- Browser sessions are signed cookies that identify a shopper and their cart; passwords are salted and hashed before storage.
- Google login is optional OAuth integration. Payment routes create demo orders only until a real payment provider is configured.

### Request flow

`HTML page -> script.js event/fetch -> Flask route in app.py -> SQLite/external service -> JSON response -> updated browser UI`

## Run on your computer

1. Open this folder in VS Code.
2. In the VS Code terminal run `python -m pip install -r requirements.txt` (only needed once).
3. Run `python app.py`.
4. Open [http://localhost:5000](http://localhost:5000) in Chrome, or start **Launch Chrome against localhost** from the Run and Debug panel.

Stop the server with `Ctrl+C` in the terminal.

## Share with friends

`localhost` is private to your computer. To get a public link, push this folder to a GitHub repository and create a new **Web Service** at [Render](https://render.com):

- Choose the GitHub repository.
- Render will detect `render.yaml` and use the included build/start commands.
- Add an environment variable named `MISTIZEN_SECRET_KEY` with a long random value before publishing.
- After deployment, send friends the generated `https://...onrender.com` link.

The account and checkout screens are demo features. They do not process real payments or provide Google/Apple sign-in until those payment and identity providers are separately configured.

## Enable Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 **Web application** client and configure the consent screen.
2. Add this exact authorized redirect URI for local development: `http://localhost:5000/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as environment variables. Do not put the secret in this repository or frontend files.
4. For Render, also set `GOOGLE_REDIRECT_URI` to `https://YOUR-SERVICE.onrender.com/api/auth/google/callback`, and add exactly the same URI in Google Cloud Console.

Google requires the redirect URI to exactly match the configured value. See the [Google OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server) for the credential setup details.
