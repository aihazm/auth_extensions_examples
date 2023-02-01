// credits to https://github.com/tobika/spotify-auth-PKCE-example/
define(["text!./template.html"],
  function (template) {
    let elRef;

    let access_token = localStorage.getItem('access_token') || null;
    let refresh_token = localStorage.getItem('refresh_token') || null;
    let expires_at = localStorage.getItem('expires_at') || null;

    const authorize_url = 'https://accounts.spotify.com/authorize';
    const client_id = '';
    const redirect_uri = 'https://your_tenant.region.qlikcloud.com/sense/app/{appId}/sheet/{sheetId}}/state/analysis' || window.location.href;

    const generateRandomString = (length) => {
      let text = '';
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
    };

    async function generateCodeChallenge(codeVerifier) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(codeVerifier),
      );

      return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    function generateUrlWithSearchParams(url, params) {
      const urlObject = new URL(url);
      urlObject.search = new URLSearchParams(params).toString();

      return urlObject.toString();
    }

    function redirectToSpotifyAuthorizeEndpoint() {
      const codeVerifier = generateRandomString(64);

      generateCodeChallenge(codeVerifier).then((code_challenge) => {
        window.localStorage.setItem('code_verifier', codeVerifier);
        window.location = generateUrlWithSearchParams(
          authorize_url,
          {
            response_type: 'code',
            client_id,
            scope: 'user-read-private user-read-email',
            code_challenge_method: 'S256',
            code_challenge,
            redirect_uri,
          },
        );
      });
    }

    function exchangeToken(code) {
      const code_verifier = localStorage.getItem('code_verifier');

      fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({
          client_id,
          grant_type: 'authorization_code',
          code,
          redirect_uri,
          code_verifier,
        }),
      })
        .then(addThrowErrorToFetch)
        .then((data) => {
          processTokenResponse(data);

          // clear search query params in the url
          window.history.replaceState({}, document.title, '/');
        })
        .catch(handleError);
    }

    function refreshToken() {
      fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({
          client_id,
          grant_type: 'refresh_token',
          refresh_token,
        }),
      })
        .then(addThrowErrorToFetch)
        .then(processTokenResponse)
        .catch(handleError);
    }

    function handleError(error) {
      console.error(error);
      mainPlaceholder.innerHTML = errorTemplate({
        status: error.response.status,
        message: error.error.error_description,
      });
    }

    async function addThrowErrorToFetch(response) {
      if (response.ok) {
        return response.json();
      } else {
        throw { response, error: await response.json() };
      }
    }

    function logout() {
      localStorage.clear();
      window.location.reload();
    }

    function processTokenResponse(data) {

      access_token = data.access_token;
      refresh_token = data.refresh_token;

      const t = new Date();
      expires_at = t.setSeconds(t.getSeconds() + data.expires_in);

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('expires_at', expires_at);

      elRef.querySelector('.oauth').innerHTML = oAuthTemplate({
        access_token,
        refresh_token,
        expires_at,
      });

      // load data of logged in user
      getUserData();
    }

    function getUserData() {
      fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: 'Bearer ' + access_token,
        },
      })
        .then(async (response) => {
          if (response.ok) {
            return response.json();
          } else {
            throw await response.json();
          }
        })
        .then((data) => {
          console.log(data);
          elRef.querySelector('.main').innerHTML = userProfileTemplate(data);
        })
        .catch((error) => {
          console.error(error);
          elRef.querySelector('.main').innerHTML = errorTemplate(error.error);
        });
    }

    function oAuthTemplate(data) {
      return `<h2>oAuth info</h2>
        <table>
          <tr>
              <td>Access token</td>
              <td>${data.access_token}</td>
          </tr>
          <tr>
              <td>Refresh token</td>
              <td>${data.refresh_token}</td>
          </tr>
          <tr>
              <td>Expires at</td>
              <td>${new Date(parseInt(data.expires_at, 10)).toLocaleString()}</td>
          </tr>
        </table>`;
    }

    function userProfileTemplate(data) {
      return `<h1>Logged in as ${data.display_name}</h1>
		  <table>
			  <tr><td>Display name</td><td>${data.display_name}</td></tr>
			  <tr><td>Id</td><td>${data.id}</td></tr>
			  <tr><td>Email</td><td>${data.email}</td></tr>
			  <tr><td>Spotify URI</td><td><a href="${data.external_urls.spotify}">${data.external_urls.spotify}</a></td></tr>
			  <tr><td>Link</td><td><a href="{{href}">${data.href}</a></td></tr>
			  <tr><td>Profile Image</td><td><a href="${data.images[0]?.url}">${data.images[0]?.url}</a></td></tr>
			  <tr><td>Country</td><td>${data.country}</td></tr>
		  </table>`;
    }

    return {
      initialProperties: {
        qHyperCubeDef: {
          qDimensions: [],
          qMeasures: [],
          qInitialDataFetch: [{
            qWidth: 10,
            qHeight: 50
          }]
        }
      },
      template: template,
      mounted: function ($element) {
        elRef = $element[0];

        const args = new URLSearchParams(window.location.search);
        const code = args.get('code');

        if (code) {
          // we have received the code from spotify and will exchange it for a access_token
          exchangeToken(code);
        } else if (access_token && refresh_token && expires_at) {
          // we are already authorized and reload our tokens from localStorage
          elRef.querySelector('.authorize').style.display = 'unset';

          elRef.querySelector('.oauth').innerHTML = oAuthTemplate({
            access_token,
            refresh_token,
            expires_at,
          });

          getUserData();
        }
        elRef.querySelector('.authorize').addEventListener('click', redirectToSpotifyAuthorizeEndpoint, false);
      }
    };
  });