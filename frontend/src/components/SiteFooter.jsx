import React, { useEffect, useState } from "react";
import { communityCharterIntro, communityCharterPoints, communityCharterClosing } from "../constants/communityCharter";

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return html;
}

function markdownToHtml(markdown) {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br />")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>${list.map((item) => `<li>${item.map(inlineMarkdown).join("<br />")}</li>`).join("")}</ul>`);
    list = [];
  };
  lines.forEach((line) => {
    if (!line.trim()) { flushParagraph(); if (!list.length) flushList(); return; }
    if (line.trim() === "---") { flushParagraph(); flushList(); blocks.push("<hr />"); return; }
    if (line.startsWith("## ")) { flushParagraph(); flushList(); blocks.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); return; }
    if (line.startsWith("- ")) { flushParagraph(); list.push([line.slice(2)]); return; }
    if (/^ {2,}\S/.test(line) && list.length) { list[list.length - 1].push(line.trim()); return; }
    if (line.startsWith("![")) { flushParagraph(); flushList(); blocks.push(inlineMarkdown(line)); return; }
    if (line.startsWith("*") && line.endsWith("*")) { flushParagraph(); flushList(); blocks.push(`<p class="about-caption">${inlineMarkdown(line)}</p>`); return; }
    flushList();
    paragraph.push(line);
  });
  flushParagraph();
  flushList();
  return blocks.join("");
}

export default function SiteFooter({ canInstallApp = false, onInstallApp }) {
  const [section, setSection] = useState(null);
  const [aboutText, setAboutText] = useState("");
  const sourceUrl = import.meta.env.VITE_SOURCE_URL || "https://github.com/damiendevienne/makibooks";
  const supportUrl = import.meta.env.VITE_SUPPORT_URL || "https://buymeacoffee.com/damiendevienne";

  useEffect(() => {
    fetch("/AboutText.md")
      .then((response) => response.ok ? response.text() : "")
      .then(setAboutText)
      .catch(() => {});
  }, []);

  const content = {
    about: {
      title: "About Maki Books",
      markdown: aboutText,
    },
    help: {
      title: "Help",
      body: [
        "Maki Books is a friendly family platform where people can lend and borrow physical books freely with readers around them. 📚",
        <><strong>Want to borrow a book?</strong> Browse the catalogue, open a book to read its details, and send a request when you find one you would love to read. Once the owner accepts, use Discussions to arrange the handover and confirm each step.</>,
        <><strong>Want to lend your books?</strong> Add them from My Books, share a few details and let nearby readers discover them. When someone sends a request, you can review it, discuss the handover and keep track of the exchange. Every book you lend can become someone else’s next favourite read. ❤️</>,
        "Maki Books works on computers and mobile devices! To install it on your phone, open the browser menu and choose Add to Home screen or Install app on Android/Chrome. On iPhone/Safari, use Share, then Add to Home Screen. Once installed, you can enable or disable notifications at any time from Settings: tap the small person-and-cog icon in the top-right corner. 🔔",
        "If you have a problem or a question, open Settings from that same top-right icon and send us a message from the Feedback section. Your message really helps us improve Maki Books. 😊",
      ],
      installAvailable: true,
    },
    legal: {
      title: "Legal",
      body: [
        "Maki Books is an independent, open-source family project. The original code and project-owned content are licensed under the GNU Affero General Public License version 3 (AGPL-3.0-only). You may use, modify and redistribute them under that license, including its source-sharing requirements for modified versions used over a network.",
        "Maki Books is provided without warranty, to the extent permitted by law. Third-party software, catalogue metadata and book covers remain subject to their respective licenses and rights. User-submitted content belongs to its respective rights holders and is not relicensed under the AGPL by this notice.",
      ],
      sourceUrl,
    },
    charter: {
      title: "Community Charter",
      footerLabel: "Charter",
      body: communityCharterIntro,
      points: communityCharterPoints,
    },
    support: {
      title: "Want to support Maki Books?",
      footerLabel: "Support ☕",
      body: "If Maki Books is useful to your family and you’d like to help us keep it running, you can support this family-made project. Contributions help with hosting, email delivery and ongoing development. ☕✨",
      supportUrl,
    },
  };

  return (
    <>
      <footer className="site-footer" aria-label="Site information">
        <div className="container">
        <div className="site-footer-links">
          {Object.entries(content).map(([key, value]) => (
            <button type="button" key={key} onClick={() => setSection(value)}>{value.footerLabel || value.title.replace("Maki Books", "").trim() || "About"}</button>
          ))}
        </div>
        <div className="site-footer-copyright">
          © 2026 Maki Books · <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">AGPLv3</a>
        </div>
        </div>
      </footer>
      {section && (
        <div className="modal fade show" style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setSection(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{section.title}</h5>
                <button type="button" className="btn-close" onClick={() => setSection(null)} aria-label="Close" />
              </div>
              <div className="modal-body">
                {section.markdown !== undefined ? (section.markdown ? <div className="about-markdown" dangerouslySetInnerHTML={{ __html: markdownToHtml(section.markdown) }} /> : <p>Loading…</p>) : Array.isArray(section.body) ? section.body.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>{section.body}</p>}
                {section.sourceUrl && <p><a href={section.sourceUrl} target="_blank" rel="noreferrer">Get the source code</a>{" · "}<a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">Read the AGPLv3 license</a></p>}
                {section.installAvailable && canInstallApp && <button type="button" className="btn btn-primary w-100 mb-2" onClick={onInstallApp}>Install Maki Books as an app</button>}
                {section.supportUrl && <a className="support-link" href={section.supportUrl} target="_blank" rel="noreferrer">Buy us a coffee! ☕</a>}
                {section.signature && <p className="about-signature mb-0">{section.signature}</p>}
                {section.points && <><ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul><p className="mb-0 fw-semibold text-center">{communityCharterClosing}</p></>}
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setSection(null)}>Close</button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
