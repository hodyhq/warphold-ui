import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import React, { Component } from "react";
import { Link, useNavigate, useLocation, useParams } from "react-router";
import { Button, Input, Spinner } from "../design/components";
import { DirectoryItems } from "../components/DirectoryItems";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { DirectoryBreadcrumbs } from "../components/DirectoryBreadcrumbs";
import PropTypes from "prop-types";

const PRIMARY_LINK_BUTTON =
  "inline-block cursor-pointer rounded-sm border border-ember bg-ember px-[14px] py-[9px] text-[12px] " +
  "font-semibold tracking-[0.06em] text-ground uppercase hover:border-ember-soft hover:bg-ember-soft hover:text-ground";

class SnapshotDirectoryInternal extends Component {
  constructor() {
    super();

    this.state = {
      items: [],
      isLoading: false,
      error: null,
      mountInfo: {},
      oid: "",
    };

    this.mount = this.mount.bind(this);
    this.unmount = this.unmount.bind(this);
    this.browseMounted = this.browseMounted.bind(this);
    this.copyPath = this.copyPath.bind(this);
    this.fetchDirectory = this.fetchDirectory.bind(this);
    this.mountedPathRef = React.createRef();
  }

  componentDidUpdate(prevProps) {
    if (this.props.params.oid !== prevProps.params.oid) {
      console.log("OID changed", prevProps.params.oid, "=>", this.props.params.oid);
      this.fetchDirectory();
    }
  }

  fetchDirectory() {
    let oid = this.props.params.oid;

    this.setState({
      isLoading: true,
      oid: oid,
    });

    axios
      .get("/api/v1/objects/" + oid)
      .then((result) => {
        this.setState({
          items: result.data.entries || [],
          isLoading: false,
        });
      })
      .catch((error) =>
        this.setState({
          error,
          isLoading: false,
        }),
      );

    axios
      .get("/api/v1/mounts/" + oid)
      .then((result) => {
        this.setState({
          mountInfo: result.data,
        });
      })
      .catch((_error) =>
        this.setState({
          mountInfo: {},
        }),
      );
  }

  componentDidMount() {
    this.fetchDirectory();
  }

  mount() {
    axios
      .post("/api/v1/mounts", { root: this.state.oid })
      .then((result) => {
        this.setState({
          mountInfo: result.data,
        });
      })
      .catch((_error) =>
        this.setState({
          mountInfo: {},
        }),
      );
  }

  unmount() {
    axios
      .delete("/api/v1/mounts/" + this.state.oid)
      .then((_result) => {
        this.setState({
          mountInfo: {},
        });
      })
      .catch((error) =>
        this.setState({
          error: error,
          mountInfo: {},
        }),
      );
  }

  browseMounted() {
    if (!window.kopiaUI) {
      alert("Directory browsing is not supported in a web browser. Use the WarpHold desktop app.");
      return;
    }

    window.kopiaUI.browseDirectory(this.state.mountInfo.path);
  }

  copyPath() {
    const el = this.mountedPathRef.current;
    if (!el) {
      return;
    }

    el.select();
    el.setSelectionRange(0, 99999);

    document.execCommand("copy");
  }

  render() {
    let { items, isLoading, error } = this.state;
    if (error) {
      return <p>ERROR: {error.message}</p>;
    }
    if (isLoading) {
      return <Spinner size={24} />;
    }

    return (
      <div className="flex flex-col gap-4">
        <DirectoryBreadcrumbs />
        <div className="flex flex-wrap items-center gap-2">
          {this.state.mountInfo.path ? (
            <>
              <Button onClick={this.unmount}>Unmount</Button>
              {window.kopiaUI && <Button onClick={this.browseMounted}>Browse</Button>}
              <Input
                ref={this.mountedPathRef}
                readOnly={true}
                aria-label="Mounted path"
                className="w-[30em] max-w-full font-mono text-[12px]"
                value={this.state.mountInfo.path}
              />
              <Button onClick={this.copyPath} data-testid="copy-path-button" title="Copy path" aria-label="Copy path">
                <FontAwesomeIcon icon={faCopy} />
              </Button>
            </>
          ) : (
            <Button onClick={this.mount}>Mount as Local Filesystem</Button>
          )}
          {/* A link, not a button: the upstream e2e follows /snapshots/dir/ links. */}
          <Link to={"/snapshots/dir/" + this.props.params.oid + "/restore"} className={PRIMARY_LINK_BUTTON}>
            Restore Files &amp; Directories
          </Link>
        </div>
        <p className="m-0 text-muted">
          You can mount/restore all the files &amp; directories that you see below or restore files individually.
        </p>
        <DirectoryItems items={items} historyState={this.props.location.state} />
        <CLIEquivalent command={`snapshot list ${this.state.oid}`} />
      </div>
    );
  }
}

SnapshotDirectoryInternal.propTypes = {
  navigate: PropTypes.func,
  params: PropTypes.object,
  location: PropTypes.object,
};

export function SnapshotDirectory(props) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  return <SnapshotDirectoryInternal navigate={navigate} params={params} location={location} {...props} />;
}
