if (typeof window !== 'undefined') {
  var BASE_URL = 'https://app.chatwoot.com';
  var g = document.createElement('script'),
    s = document.getElementsByTagName('script')[0];
  g.src = BASE_URL + '/packs/js/sdk.js';
  g.defer = true;
  g.async = true;
  s.parentNode.insertBefore(g, s);
  g.onload = function () {
    window.chatwootSDK.run({
      websiteToken: 'QdvteKJRW9sE2zsJXAir5Ed4',
      baseUrl: BASE_URL,
    });
  };
}
