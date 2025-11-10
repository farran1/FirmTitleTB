// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

// Handle GitHub Pages redirect format
// The 404.html redirects /path to /?/path, so we need to restore it
(function() {
  var search = window.location.search;
  if (search && search.indexOf('?/') === 0) {
    var path = search.slice(2).replace(/~and~/g, '&');
    var newPath = '/' + path;
    window.history.replaceState(null, '', newPath);
  }
})();

const container = document.getElementById("root")!;
createRoot(container).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
);
