import axios from "axios";
import React, { Component } from "react";
import { Button, Eyebrow, Input, Pill, Spinner } from "../design/components";
import { Col, Row } from "../components/Layout";
import { handleChange } from "../forms";
import { SetupRepository } from "../components/SetupRepository";
import { CLIEquivalent } from "../components/CLIEquivalent";
import { cancelTask } from "../utils/taskutil";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronCircleDown, faChevronCircleUp, faWindowClose } from "@fortawesome/free-solid-svg-icons";
import { Logs } from "../components/Logs";
import { AppContext } from "../contexts/AppContext";

export class Repository extends Component {
  constructor() {
    super();

    this.state = {
      status: {},
      isLoading: true,
      error: null,
      provider: "",
      description: "",
    };

    this.mounted = false;
    this.disconnect = this.disconnect.bind(this);
    this.updateDescription = this.updateDescription.bind(this);
    this.handleChange = handleChange.bind(this);
    this.fetchStatus = this.fetchStatus.bind(this);
    this.fetchStatusWithoutSpinner = this.fetchStatusWithoutSpinner.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.fetchStatus(this.props);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  fetchStatus() {
    if (this.mounted) {
      this.setState({
        isLoading: true,
      });
    }

    this.fetchStatusWithoutSpinner();
  }

  fetchStatusWithoutSpinner() {
    axios
      .get("/api/v1/repo/status")
      .then((result) => {
        if (this.mounted) {
          this.setState({
            status: result.data,
            isLoading: false,
          });

          // Update the app context to reflect the successfully-loaded description.
          this.context.repositoryDescriptionUpdated(result.data.description);

          if (result.data.initTaskID) {
            window.setTimeout(() => {
              this.fetchStatusWithoutSpinner();
            }, 1000);
          }
        }
      })
      .catch((error) => {
        if (this.mounted) {
          this.setState({
            error,
            isLoading: false,
          });
        }
      });
  }

  disconnect() {
    this.setState({ isLoading: true });
    axios
      .post("/api/v1/repo/disconnect", {})
      .then((_result) => {
        this.context.repositoryUpdated(false);
      })
      .catch((error) =>
        this.setState({
          error,
          isLoading: false,
        }),
      );
  }

  updateDescription() {
    this.setState({
      isLoading: true,
    });

    axios
      .post("/api/v1/repo/description", {
        description: this.state.status.description,
      })
      .then((result) => {
        // Update the app context to reflect the successfully-saved description.
        this.context.repositoryDescriptionUpdated(result.data.description);

        this.setState({
          isLoading: false,
        });
      })
      .catch((_error) => {
        this.setState({
          isLoading: false,
        });
      });
  }

  render() {
    let { isLoading, error } = this.state;
    if (error) {
      return <p>{error.message}</p>;
    }

    if (isLoading) {
      return <Spinner size={24} />;
    }

    if (this.state.status.initTaskID) {
      return (
        <div className="flex flex-col items-start gap-4">
          <h1 className="font-display m-0 flex items-center gap-3 text-[24px] font-extrabold tracking-[-0.02em]">
            <Spinner size={18} /> Initializing Repository...
          </h1>
          {this.state.showLog ? (
            <>
              <Button onClick={() => this.setState({ showLog: false })}>
                <FontAwesomeIcon icon={faChevronCircleUp} /> Hide Log
              </Button>
              <Logs taskID={this.state.status.initTaskID} />
            </>
          ) : (
            <Button onClick={() => this.setState({ showLog: true })}>
              <FontAwesomeIcon icon={faChevronCircleDown} /> Show Log
            </Button>
          )}
          <hr className="w-full border-line" />
          <Button variant="danger" title="Cancel" onClick={() => cancelTask(this.state.status.initTaskID)}>
            <FontAwesomeIcon icon={faWindowClose} /> Cancel Connection
          </Button>
        </div>
      );
    }

    if (this.state.status.connected) {
      return (
        <div className="flex flex-col gap-4">
          <div>
            <Eyebrow>Repository</Eyebrow>
            <h1 className="font-display m-0 mt-2 flex items-center gap-3 text-[28px] leading-none font-extrabold tracking-[-0.02em]">
              {this.state.status.description}
            </h1>
            <p className="mt-2 mb-0 flex items-center gap-2 text-[13px] text-good">
              <FontAwesomeIcon icon={faCheck} />
              <span>Connected To Repository</span>
              {this.state.status.readonly && <Pill tone="warn">Repository is read-only</Pill>}
            </p>
          </div>
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-2">
              <Input
                autoFocus={true}
                aria-label="Repository description"
                aria-invalid={!this.state.status.description ? "true" : undefined}
                name="status.description"
                value={this.state.status.description}
                onChange={this.handleChange}
                className="grow"
              />
              <Button data-testid="update-description" onClick={this.updateDescription} type="button">
                Update Description
              </Button>
            </div>
            {!this.state.status.description && (
              <span role="alert" className="text-[12px] text-bad">
                Description Is Required
              </span>
            )}
          </div>
          <hr className="border-line" />
          <div className="flex flex-col gap-4">
            {this.state.status.apiServerURL ? (
              <>
                <Row>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Server URL</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.apiServerURL} />
                    </label>
                  </Col>
                </Row>
              </>
            ) : (
              <>
                <Row>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Config File</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.configFile} />
                    </label>
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Provider</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.storage} />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Encryption Algorithm</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.encryption} />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Hash Algorithm</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.hash} />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Splitter Algorithm</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.splitter} />
                    </label>
                  </Col>
                </Row>
                <Row>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Repository Format</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.formatVersion} />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Error Correction Overhead</Eyebrow>
                      <Input
                        readOnly
                        defaultValue={
                          this.state.status.eccOverheadPercent > 0
                            ? this.state.status.eccOverheadPercent + "%"
                            : "Disabled"
                        }
                      />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Error Correction Algorithm</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.ecc || "-"} />
                    </label>
                  </Col>
                  <Col>
                    <label className="flex flex-col gap-[6px]">
                      <Eyebrow>Internal Compression</Eyebrow>
                      <Input readOnly defaultValue={this.state.status.supportsContentCompression ? "yes" : "no"} />
                    </label>
                  </Col>
                </Row>
              </>
            )}
            <Row>
              <Col>
                <label className="flex flex-col gap-[6px]">
                  <Eyebrow>Connected as:</Eyebrow>
                  <Input readOnly defaultValue={this.state.status.username + "@" + this.state.status.hostname} />
                </label>
              </Col>
            </Row>
            <div>
              <Button data-testid="disconnect" variant="danger" onClick={this.disconnect}>
                Disconnect
              </Button>
            </div>
          </div>

          <CLIEquivalent command="repository status" />
        </div>
      );
    }

    return <SetupRepository />;
  }
}

Repository.contextType = AppContext;
