import React from "react";
import { useNavigate, useLocation } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";

/**
 * The path back up out of a browsed snapshot, as Solo.dc.html draws it: each
 * ancestor is a link, the current directory is plain text, and its object ID
 * hangs off an info icon rather than a popover.
 */
export function DirectoryBreadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const breadcrumbs = [];
  for (let state = location.state; state; state = state.prevState) {
    breadcrumbs.unshift(state);
  }

  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-[13px]">
      {breadcrumbs.map((state, i) => {
        const index = breadcrumbs.length - i - 1; // revert index
        const current = index === 0;
        return (
          <React.Fragment key={index}>
            {i > 0 && <span className="text-dim">/</span>}
            {current ? (
              // Where you already are is not a destination: plain text, not a
              // control that looks live but does nothing.
              <span aria-current="page" className="text-ink">
                {state.label}
              </span>
            ) : (
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-ember-soft hover:text-ember-hover"
                onClick={() => navigate(-index)}
              >
                {state.label}
              </button>
            )}
            {state.oid && current && (
              <FontAwesomeIcon className="text-dim" icon={faInfoCircle} title={"OID: " + state.oid} />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
