"use strict";

const moment = require("moment");

const router = require("express-promise-router")();

const cache = require("../cache");
const log = require("../logger");
const { getMeta } = require("../list");
const { fetchDoc, cleanName, fetchByline } = require("../docs");
const { getTemplates, sortDocs, stringTemplate } = require("../utils");
const { parseUrl } = require("../urlParser");

router.get("*", handleCategory);
module.exports = router;

const categories = getTemplates("categories");
async function handleCategory(req, res) {
  log.info(`GET ${req.path}`);
  // FIXME: consider putting this in middleware and save on req
  const { meta, parent, data, root } = await parseUrl(req.path);

  if (!meta || !data) return "next";

  const { resourceType, tags, id } = meta;
  const { breadcrumb } = data;

  const layout = categories.has(root) ? root : "default";
  const template = `categories/${layout}`;

  const parentMeta = getMeta(parent.id);
  if (
    tags.includes("playlist") ||
    (parentMeta && parentMeta.tags.includes("playlist"))
  ) {
    return "next";
  }

  // don't try to fetch branch node
  const contextData = prepareContextualData(
    data,
    req.path,
    breadcrumb,
    parent,
    meta.slug
  );

  const baseRenderData = Object.assign({}, contextData, {
    url: req.path,
    title: meta.prettyName,
    lastUpdatedBy: (meta.lastModifyingUser || {}).displayName,
    modifiedAt: meta.modifiedTime,
    createdAt: moment(meta.createdTime).fromNow(),
    editLink:
      meta.mimeType === "text/html"
        ? meta.folder.webViewLink
        : meta.webViewLink,
    id,
    template: stringTemplate
  });

  // if this is a folder, just render from the generic data
  if (resourceType === "folder") {
    return res.render(template, baseRenderData, (err, html) => {
      if (err) throw err;

      cache.add(id, meta.modifiedTime, req.path, html);
      res.end(html);
    });
  }

  // for docs, fetch the html and then combine with the base data
  const { html, originalRevision, sections } = await fetchDoc(
    id,
    resourceType,
    req
  );
  res.locals.docId = data.id; // we need this for history later
  const revisionData = originalRevision.data || { lastModifyingUser: {} };
  const payload = fetchByline(html, revisionData.lastModifyingUser.displayName);
  res.render(
    template,
    Object.assign({}, baseRenderData, {
      content: payload.html,
      byline: payload.byline,
      createdBy: revisionData.lastModifyingUser.displayName,
      sections
    }),
    (err, html) => {
      if (err) throw err;
      cache.add(id, meta.modifiedTime, req.path, html);
      res.end(html);
    }
  );
}

function prepareContextualData(data, url, breadcrumb, parent, slug) {
  const breadcrumbInfo = breadcrumb.map(({ id }) => getMeta(id));

  const { children: siblings } = parent;
  const { children } = data;
  const self = url.split("/").slice(-1)[0];
  // most of what we are doing here is preparing parents and siblings
  // we need the url and parent object, as well as the breadcrumb to do that
  const siblingLinks = createRelatedList(
    siblings,
    self,
    `${url
      .split("/")
      .slice(0, -1)
      .join("/")}`
  );
  const childrenLinks = createRelatedList(children || {}, self, url);

  // extend the breadcrumb with render data
  const parentLinks = url
    .split("/")
    .slice(1, -1) // ignore the base empty string and self
    .map((segment, i, arr) => {
      return {
        url: `/${arr.slice(0, i + 1).join("/")}`,
        name: cleanName(breadcrumbInfo[i].name),
        editLink: breadcrumbInfo[i].webViewLink
      };
    });

  const { id, originalId } = breadcrumb.length
    ? breadcrumb[breadcrumb.length - 1]
    : data;
  return {
    parentId: originalId || id,
    parentLinks,
    siblings: siblingLinks,
    children: childrenLinks
  };
}

function createRelatedList(slugs, self, baseUrl) {
  return Object.keys(slugs)
    .filter(slug => slug !== self)
    .map(slug => {
      const { id } = slugs[slug];
      const {
        sort,
        prettyName,
        webViewLink,
        path: url,
        resourceType,
        tags
      } = getMeta(id);
      return {
        sort,
        name: prettyName,
        editLink: webViewLink,
        resourceType,
        url,
        tags
      };
    })
    .filter(({ tags }) => !tags.includes("hidden"))
    .sort(sortDocs);
}
