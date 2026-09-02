import clsx from "clsx";
import { faUserFriends } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import React, { Component } from "react";
import { Button, Card, Eyebrow, Select } from "../design/components";
import { Col, Row } from "../components/Layout";
import { Link, useNavigate } from "react-router";
import { handleChange } from "../forms";
import { OptionalDirectory } from "../forms/OptionalDirectory";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { compare, formatMilliseconds, formatOwnerName } from "../utils/formatutils";
import { redirect } from "../utils/uiutil";
import { checkPolicyPath, policyEditorURL } from "../utils/policyutil";
import PropTypes from "prop-types";

const applicablePolicies = "Applicable Policies";
const localPolicies = "Local Path Policies";
const allPolicies = "All Policies";
const globalPolicy = "Global Policy";
const perUserPolicies = "Per-User Policies";
const perHostPolicies = "Per-Host Policies";

/** "keep 24 h / 7 d / 4 w" from whichever retention buckets are set. */
function retentionSummary(retention) {
  const buckets = [
    [retention?.keepLatest, "latest"],
    [retention?.keepHourly, "h"],
    [retention?.keepDaily, "d"],
    [retention?.keepWeekly, "w"],
    [retention?.keepMonthly, "m"],
    [retention?.keepAnnual, "y"],
  ].filter(([n]) => n);
  return buckets.length ? "keep " + buckets.map(([n, unit]) => n + " " + unit).join(" / ") : "";
}

/** "every 1h", "daily at 2 times", "manual only" - however this policy runs. */
function schedulingSummary(scheduling) {
  if (!scheduling) {
    return "";
  }
  if (scheduling.manual) {
    return "manual only";
  }
  if (scheduling.intervalSeconds) {
    return "every " + formatMilliseconds(scheduling.intervalSeconds * 1000, true);
  }
  if (scheduling.cron?.length) {
    return "cron: " + scheduling.cron.join(", ");
  }
  if (scheduling.timeOfDay?.length) {
    return scheduling.timeOfDay
      .map((t) => (typeof t === "object" ? t.hour + ":" + String(t.min).padStart(2, "0") : t))
      .join(", ");
  }
  return "";
}

/**
 * The one line under a policy's name: what it keeps, when it runs, what it
 * skips and how it compresses. Empty pieces drop out, and a policy that sets
 * none of them is inheriting everything from its parent.
 */
export function policySummaryLine(policy) {
  const bits = [
    schedulingSummary(policy?.scheduling),
    retentionSummary(policy?.retention),
    policy?.files?.ignore?.length ? policy.files.ignore.length + " excludes" : "",
    policy?.compression?.compressorName,
  ].filter(Boolean);

  return bits.length ? bits.join(" · ") : "inherits from parent";
}

/** How a policy's target reads as a card title. */
function targetTitle(target) {
  if (target.path) {
    return target.path;
  }
  return target.host ? "All paths on " + target.host : "Global defaults";
}

export class PoliciesInternal extends Component {
  constructor() {
    super();
    this.state = {
      policies: [],
      isLoading: true,
      error: null,
      editorTarget: null,
      selectedOwner: applicablePolicies,
      policyPath: "",
      sources: [],
    };

    this.editPolicyForPath = this.editPolicyForPath.bind(this);
    this.handleChange = handleChange.bind(this);
    this.fetchPolicies = this.fetchPolicies.bind(this);
    this.fetchSourcesWithoutSpinner = this.fetchSourcesWithoutSpinner.bind(this);
  }

  componentDidMount() {
    this.fetchPolicies();
    this.fetchSourcesWithoutSpinner();
  }

  sync() {
    this.fetchPolicies();

    axios
      .post("/api/v1/repo/sync", {})
      .then((_) => {
        this.fetchSourcesWithoutSpinner();
      })
      .catch((error) => {
        this.setState({
          error,
          isLoading: false,
        });
      });
  }

  fetchPolicies() {
    axios
      .get("/api/v1/policies")
      .then((result) => {
        this.setState({
          policies: result.data.policies,
          isLoading: false,
        });
      })
      .catch((error) => {
        redirect(error);
        this.setState({
          error,
          isLoading: false,
        });
      });
  }

  fetchSourcesWithoutSpinner() {
    axios
      .get("/api/v1/sources")
      .then((result) => {
        this.setState({
          localSourceName: result.data.localUsername + "@" + result.data.localHost,
          localUsername: result.data.localUsername,
          localHost: result.data.localHost,
          multiUser: result.data.multiUser,
          sources: result.data.sources,
          isLoading: false,
        });
      })
      .catch((error) => {
        redirect(error);
        this.setState({
          error,
          isLoading: false,
        });
      });
  }

  editPolicyForPath(e) {
    e.preventDefault();

    if (!this.state.policyPath) {
      return;
    }

    const error = checkPolicyPath(this.state.policyPath, this.state.localHost, this.state.localUsername);

    if (error) {
      alert(
        error +
          "\nMust be either an absolute path, `user@host:/absolute/path`, `user@host` or `@host`. Use backslashes on Windows.",
      );
      return;
    }

    this.props.navigate(
      policyEditorURL({
        userName: this.state.localUsername,
        host: this.state.localHost,
        path: this.state.policyPath,
      }),
    );
  }

  selectOwner(h) {
    this.setState({
      selectedOwner: h,
    });
  }

  isGlobalPolicy(x) {
    return !x.target.userName && !x.target.host && !x.target.path;
  }

  isLocalHostPolicy(x) {
    return !x.target.userName && x.target.host === this.state.localHost && !x.target.path;
  }

  isLocalUserPolicy(x) {
    return formatOwnerName(x.target) === this.state.localSourceName;
  }

  render() {
    let { policies, sources, isLoading, error } = this.state;
    if (error) {
      return <p>{error.message}</p>;
    }
    if (isLoading) {
      return <p>Loading ...</p>;
    }

    let uniqueOwners = sources.reduce((a, d) => {
      const owner = formatOwnerName(d.source);

      if (!a.includes(owner)) {
        a.push(owner);
      }
      return a;
    }, []);

    uniqueOwners.sort();

    switch (this.state.selectedOwner) {
      case allPolicies:
        // do nothing;
        break;

      case globalPolicy:
        policies = policies.filter((x) => this.isGlobalPolicy(x));
        break;

      case localPolicies:
        policies = policies.filter((x) => this.isLocalUserPolicy(x));
        break;

      case applicablePolicies:
        policies = policies.filter(
          (x) => this.isLocalUserPolicy(x) || this.isLocalHostPolicy(x) || this.isGlobalPolicy(x),
        );
        break;

      case perUserPolicies:
        policies = policies.filter((x) => !!x.target.userName && !!x.target.host && !x.target.path);
        break;

      case perHostPolicies:
        policies = policies.filter((x) => !x.target.userName && !!x.target.host && !x.target.path);
        break;

      default:
        policies = policies.filter((x) => formatOwnerName(x.target) === this.state.selectedOwner);
        break;
    }

    policies.sort((l, r) => {
      const hc = compare(l.target.host, r.target.host);
      if (hc) {
        return hc;
      }
      const uc = compare(l.target.userName, r.target.userName);
      if (uc) {
        return uc;
      }
      return compare(l.target.path, r.target.path);
    });

    return (
      <div className="flex flex-col gap-4">
        <div>
          <Eyebrow>Policies</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            What gets kept
          </h1>
        </div>
        {!this.state.editorTarget && (
          <form onSubmit={this.editPolicyForPath}>
            <Row className="items-end">
              <Col xs="auto">
                <label className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faUserFriends} className="text-muted" aria-hidden="true" />
                  <span className="sr-only">Show policies for</span>
                  <Select
                    className="py-[6px] text-[12px]"
                    value={this.state.selectedOwner}
                    onChange={(e) => this.selectOwner(e.target.value)}
                  >
                    <option value={applicablePolicies}>{applicablePolicies}</option>
                    <option value={localPolicies}>{localPolicies}</option>
                    <option value={allPolicies}>{allPolicies}</option>
                    <option value={globalPolicy}>{globalPolicy}</option>
                    <option value={perUserPolicies}>{perUserPolicies}</option>
                    <option value={perHostPolicies}>{perHostPolicies}</option>
                    {uniqueOwners.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </label>
              </Col>
              {(this.state.selectedOwner === localPolicies ||
                this.state.selectedOwner === this.state.localSourceName ||
                this.state.selectedOwner === applicablePolicies) && (
                <>
                  <Col>
                    {OptionalDirectory(this, null, "policyPath", {
                      autoFocus: true,
                      placeholder: "enter directory to find or set policy",
                    })}
                  </Col>
                  <Col xs="auto">
                    <Button disabled={!this.state.policyPath} type="submit" onClick={this.editPolicyForPath}>
                      Set Policy
                    </Button>
                  </Col>
                </>
              )}
            </Row>
          </form>
        )}

        {policies.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-muted">Found {policies.length} policies matching criteria.</p>
            {/* Cards, not a table: a policy is a paragraph about one target,
                and there are few enough of them that paging never helps. */}
            <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
              {policies.map((x) => (
                <Card
                  key={policyEditorURL(x.target)}
                  data-testid="policy-card"
                  className={clsx("gap-[10px]", this.isGlobalPolicy(x) && "md:col-span-2")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono">{targetTitle(x.target)}</span>
                    <Link data-testid="edit-policy" to={policyEditorURL(x.target)}>
                      Edit
                    </Link>
                  </div>
                  <div className="font-mono text-[12px] text-dim">
                    {(x.target.userName || "*") + "@" + (x.target.host || "*")}
                  </div>
                  <div className="text-muted">{policySummaryLine(x.policy)}</div>
                </Card>
              ))}
            </div>
          </div>
        ) : this.state.selectedOwner === localPolicies && this.state.policyPath ? (
          <p className="text-muted">
            No policy found for directory <code className="font-mono">{this.state.policyPath}</code>. Click{" "}
            <b>Set Policy</b> to define it.
          </p>
        ) : (
          <p className="text-muted">No policies found.</p>
        )}
        <CLIEquivalent command="policy list" />
      </div>
    );
  }
}

PoliciesInternal.propTypes = {
  navigate: PropTypes.func.isRequired,
};

export function Policies(props) {
  const navigate = useNavigate();

  return <PoliciesInternal navigate={navigate} {...props} />;
}
