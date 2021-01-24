//console.log('ayo 11ty');
require("dotenv").config();

const cleanCSS = require("clean-css");
const {minify} = require("terser");
const fs = require("fs");
const pluginRSS = require("@11ty/eleventy-plugin-rss");
const lazyImages = require("eleventy-plugin-lazyimages");
const ghostContentAPI = require("@tryghost/content-api");
const localImages = require("eleventy-plugin-local-images");

const htmlMinTransform = require("./src/transforms/html-min-transform.js");

// Init Ghost API
const api = new ghostContentAPI({
  url: process.env.GHOST_API_URL,
  key: process.env.GHOST_CONTENT_API_KEY,
  version: "v2"
});

let eleventyConfig = function (config) {
  // minify js
  config.addNunjucksAsyncFilter("jsmin", async function (
    code,
    callback
  ) {
    try {
      const minified = await minify(code);
      callback(null, minified.code);
    } catch (err) {
      console.error("Terser error: ", err);
      // Fail gracefully.
      callback(null, code);
    }
  });

  // Minify HTML
  config.addTransform("htmlmin", htmlMinTransform);

  // Assist RSS feed template
  config.addPlugin(pluginRSS);

  // Apply performance attributes to images
  config.addPlugin(lazyImages, {
    cacheFile: ""
  });

  // Inline CSS
  config.addFilter("cssmin", code => {
    return new cleanCSS({}).minify(code).styles;
  });

  // Date formatting filter
  config.addFilter("htmlDateString", dateObj => {
    return new Date(dateObj).toISOString().split("T")[0];
  });

  // Don't ignore the same files ignored in the git repo
  config.setUseGitIgnore(false);

  // Display 404 page in BrowserSnyc
  config.setBrowserSyncConfig({
    callbacks: {
      ready: (err, bs) => {
        const content_404 = fs.readFileSync("dist/404.html");

        bs.addMiddleware("*", (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404);
          res.end();
        });
      }
    }
  });

  // Copy images over from Ghost
  config.addPlugin(localImages, {
    distPath: "dist",
    assetPath: "/assets/images",
    selector: "img",
    attribute: "data-src", // Lazy images attribute
    verbose: false
  });

  // GHOST
  // Get all posts
  config.addCollection("posts", async function(collection) {
    collection = await api.posts
      .browse({
        include: "tags,authors",
        limit: "all"
      })
      .catch(err => {
        console.error(err);
      });

    collection.forEach(post => {
      post.url = stripDomain(post.url);
      post.primary_author.url = stripDomain(post.primary_author.url);
      post.tags.map(tag => (tag.url = stripDomain(tag.url)));

      // Convert publish date into a Date object
      post.published_at = new Date(post.published_at);
    });

    // Bring featured post to the top of the list
    collection.sort((post, nextPost) => nextPost.featured - post.featured);

    return collection;
  });

  // Get all authors
  config.addCollection("authors", async function(collection) {
    collection = await api.authors
      .browse({
        limit: "all"
      })
      .catch(err => {
        console.error(err);
      });

    // Get all posts with their authors attached
    const posts = await api.posts
      .browse({
        include: "authors",
        limit: "all"
      })
      .catch(err => {
        console.error(err);
      });

    // Attach posts to their respective authors
    collection.forEach(async author => {
      const authorsPosts = posts.filter(post => {
        post.url = stripDomain(post.url);
        return post.primary_author.id === author.id;
      });
      if (authorsPosts.length) author.posts = authorsPosts;

      author.url = stripDomain(author.url);
    });

    return collection;
  });

  // Get all tags
  config.addCollection("tags", async function(collection) {
    collection = await api.tags
      .browse({
        include: "count.posts",
        limit: "all"
      })
      .catch(err => {
        console.error(err);
      });

    // Get all posts with their tags attached
    const posts = await api.posts
      .browse({
        include: "tags,authors",
        limit: "all"
      })
      .catch(err => {
        console.error(err);
      });

    // Attach posts to their respective tags
    collection.forEach(async tag => {
      const taggedPosts = posts.filter(post => {
        post.url = stripDomain(post.url);
        return post.primary_tag && post.primary_tag.slug === tag.slug;
      });
      if (taggedPosts.length) tag.posts = taggedPosts;

      tag.url = stripDomain(tag.url);
    });

    return collection;
  });

  //
  // Eleventy configuration
  return {
    dir: {
      input: "src",
      output: "dist"
    },

    // Files read by Eleventy, add as needed
    templateFormats: ["css", "njk", "md", "txt"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    passthroughFileCopy: true
  };
};

module.exports = eleventyConfig;
