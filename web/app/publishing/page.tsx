import type { Metadata } from "next";
import { readPublication } from "../../publication";
export const metadata: Metadata = { title: "Publishing status | Personal Hub" };
const personal = "https://github.com/ahmedkhaledmohamed/Personal";
const application = "https://github.com/ahmedkhaledmohamed/the-hub";
function Revision({ value, repo }: { value: string | null; repo: string }) {
  return value ? <a href={`${repo}/commit/${value}`} target="_blank" rel="noopener noreferrer"><code>{value.slice(0, 12)}</code></a> : <>Not available</>;
}
export default function Page() {
  const status = readPublication();
  const generated = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto", timeZoneName: "short" }).format(new Date(status.builtAt));
  return <div className="library-page publication-page">
    <header className="library-heading"><h1>Publishing status</h1><p>The content snapshot in the build you are viewing.</p></header>
    <dl className="publication-facts">
      <div><dt>Environment</dt><dd>{({ production: "Production", preview: "Preview", local: "Local preview" })[status.environment] || "Unknown"}</dd></div>
      <div><dt>Build generated</dt><dd><time dateTime={status.builtAt}>{generated}</time></dd></div>
      <div><dt>Library</dt><dd>{status.libraryCount} documents and supporting files</dd></div>
      <div><dt>Personal content commit</dt><dd><Revision value={status.contentCommit} repo={personal} />{status.contentBranch && <span className="publication-secondary">{status.contentBranch}</span>}</dd></div>
      <div><dt>Hub application commit</dt><dd><Revision value={status.applicationCommit} repo={application} /><span className="publication-secondary">{status.applicationMatchesPin === true ? "Commit matches the catalog pin" : status.applicationMatchesPin === false ? "Differs from the catalog pin" : "Pin comparison unavailable"}</span></dd></div>
      {status.deploymentId && <div><dt>Deployment</dt><dd><code>{status.deploymentId}</code></dd></div>}
    </dl>
    {status.localChanges && <p className="library-status">This build includes uncommitted content changes. The content commit alone does not describe those edits.</p>}
    {status.applicationLocalChanges && <p className="library-status">This build also includes uncommitted application changes.</p>}
    <section><h2>Included in the Library</h2><p>Supported files from these selected folders are copied into this build.</p>
      <div className="publication-table-wrap"><table><thead><tr><th scope="col">Category</th><th scope="col">Source folder</th><th scope="col">Files</th></tr></thead><tbody>{status.categories.map(category => <tr key={category.path}><td><a href={`/library/?folder=${encodeURIComponent(category.path)}`}>{category.title}</a></td><td><code>{category.path}/</code></td><td>{category.count}</td></tr>)}</tbody></table></div>
      <p className="publication-note">Hidden files, source symlinks, operational scripts, and unsupported file types are excluded. Education also supports PowerPoint, ZIP and RAR downloads; archives are not extracted.</p>
      <p className="publication-note">Supported file types: {status.fileTypes.standard.join(", ")}. Additional Education downloads: {status.fileTypes.educationDownloads.join(", ")}.</p>
    </section>
    <section><h2>Outside the Library selection</h2><p>These committed source folders stay in the private repo. Selecting a folder below opens GitHub.</p>
      <ul className="publication-folders">{status.outsideLibrary.map(folder => <li key={folder}><a href={`${personal}/tree/${status.contentCommit || "main"}/${encodeURIComponent(folder)}`} target="_blank" rel="noopener noreferrer">{folder}/</a></li>)}</ul>
      <p>Root-level files such as <a href={`${personal}/blob/${status.contentCommit || "main"}/CONTEXT.md`} target="_blank" rel="noopener noreferrer">CONTEXT.md</a> and <a href={`${personal}/blob/${status.contentCommit || "main"}/WORKSPACE.md`} target="_blank" rel="noopener noreferrer">WORKSPACE.md</a> are not Library documents. The <a href="/overview/">Personal overview</a> and <a href="/start-here/">Start here guide</a> provide selected context and navigation.</p>
    </section>
    <section><h2>Visualization assets</h2><p>{status.assetCount} files are also served through these explicit asset selections. These can overlap with Library downloads.</p><ul>{status.assetPaths.map(source => <li key={source}><code>{source}/</code></li>)}</ul></section>
    <section><h2>From repo to Hub</h2><ol><li>Add or edit supported content in a selected folder on a feature branch.</li><li>Review the full diff, commit and push the approved change, and open a PR.</li><li>Merge the approved PR into Personal&apos;s <code>main</code>.</li><li>Wait for Vercel to finish deploying, then check this page&apos;s content commit.</li></ol>
      <p>Open PRs and uncommitted files are not included in production. New project or tool cards need a catalog entry; new categories or file types need an explicit application/configuration change.</p>
      <div className="publication-actions"><a className="library-button" href={`${personal}/pulls`} target="_blank" rel="noopener noreferrer">Open Personal pull requests</a>{status.contentCommit && <a className="library-button" href={`${personal}/compare/${status.contentCommit}...main`} target="_blank" rel="noopener noreferrer">Check newer commits</a>}{status.deploymentDashboardUrl && <a className="library-button" href={status.deploymentDashboardUrl} target="_blank" rel="noopener noreferrer">Open Vercel deployments</a>}</div>
      <p className="publication-note">Build time records when the files were generated, not deployment completion. PR and deployment state can change after this build; the linked services show their current state.</p>
    </section>
  </div>;
}
