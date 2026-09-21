/* SPXTR — old page addresses (shop.html, product.html…) forward to the new ones (shop/, product/…),
   keeping anything after ? or #, so links already sent out keep working. */
(function (s) { location.replace(s.getAttribute('data-to') + location.search + location.hash); })(document.currentScript);
