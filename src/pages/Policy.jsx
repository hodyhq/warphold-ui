import React from "react";
import { useNavigate, useLocation } from "react-router";
import { PolicyEditor } from "../components/policy-editor/PolicyEditor";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { parseQuery } from "../utils/formatutils";
import { PolicyTypeName } from "../utils/policyutil";
import { GoBackButton } from "../components/GoBackButton";
import { Eyebrow } from "../design/components";

export function Policy() {
  const navigate = useNavigate();
  const location = useLocation();

  const source = parseQuery(location.search);
  const { userName, host, path } = source;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-line-strong pb-3">
        <GoBackButton />
        <div>
          <Eyebrow>Policy</Eyebrow>
          <h1 className="font-display m-0 text-[24px] leading-none font-extrabold tracking-[-0.02em]">
            {PolicyTypeName(source)}
          </h1>
        </div>
      </div>
      <PolicyEditor userName={userName} host={host} path={path} close={() => navigate(-1)} />
      <CLIEquivalent command={`policy set "${userName}@${host}:${path}"`} />
    </div>
  );
}
