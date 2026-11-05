import { BoldText } from "./bold";
import { forwardRef } from "react";
import { githubUrl, type ResumeDocument } from "./model";

export const Resume = forwardRef<HTMLDivElement, { doc: ResumeDocument }>(
  function Resume({ doc }, ref) {
    const { profile, theme } = doc;
    const link = githubUrl(profile.github);
    return (
      <article
        className={`paper theme-${theme.preset} font-${theme.font}`}
        aria-label="A4 简历预览"
        style={{ "--resume-accent": theme.accent } as React.CSSProperties}
      >
        <div ref={ref} className="resume-content">
          <header className="resume-header">
            <div className="resume-identity">
              <h1>{profile.name || "姓名"}</h1>
              {profile.school && (
                <p className="school">
                  <BoldText text={profile.school} />
                </p>
              )}
              <div className="contact">
                {profile.email && (
                  <span>
                    邮箱：
                    <a href={`mailto:${profile.email}`}>{profile.email}</a>
                  </span>
                )}
                {profile.phone && (
                  <span>
                    电话：<a href={`tel:${profile.phone}`}>{profile.phone}</a>
                  </span>
                )}
                {profile.github && (
                  <span>
                    GitHub：
                    <a href={link} target="_blank" rel="noreferrer">
                      {profile.github
                        .replace(/^https?:\/\//, "")
                        .replace(/\/$/, "")}
                    </a>
                  </span>
                )}
              </div>
            </div>
            {theme.photo && profile.photo && (
              <img
                className="portrait"
                src={profile.photo}
                alt={`${profile.name}证件照`}
              />
            )}
          </header>
          {doc.sections
            .filter((s) => s.visible)
            .map((s) => (
              <section
                key={s.id}
                className="resume-section"
                data-section-title={s.title}
              >
                <h2>{s.title}</h2>
                {s.kind === "list" ? (
                  <div className="resume-list">
                    {s.items.map((item, i) => (
                      <p key={i}>
                        <BoldText text={item} />
                      </p>
                    ))}
                  </div>
                ) : (
                  s.entries.map((e) => (
                    <div className="resume-entry" key={e.id}>
                      <div className="entry-heading">
                        <h3>
                          {e.title}
                          {e.role && `｜${e.role}`}
                        </h3>
                        <time>{e.date}</time>
                      </div>
                      {e.stack && (
                        <p className="stack">
                          <b>相关技术：</b>
                          <BoldText text={e.stack} />
                        </p>
                      )}
                      {e.description && (
                        <p>
                          <b>项目描述：</b>
                          <BoldText text={e.description} />
                        </p>
                      )}
                      {!!e.bullets.length && (
                        <>
                          <p>
                            <b>主要工作：</b>
                          </p>
                          <ul>
                            {e.bullets.map((b, i) => (
                              <li key={i}>
                                <BoldText text={b} />
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ))
                )}
              </section>
            ))}
        </div>
      </article>
    );
  },
);
