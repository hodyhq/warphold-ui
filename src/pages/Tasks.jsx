import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import moment from "moment";
import React, { Component } from "react";
import { Card, Eyebrow, Input, Select } from "../design/components";
import { Col, Row } from "../components/Layout";
import { Link } from "react-router";
import { handleChange } from "../forms";
import KopiaTable from "../components/KopiaTable";
import { redirect } from "../utils/uiutil";
import { taskStatusSymbol } from "../utils/taskutil";

export class Tasks extends Component {
  constructor() {
    super();
    this.state = {
      items: [],
      isLoading: true,
      error: null,
      showKind: "All",
      showStatus: "All",
      uniqueKinds: [],
      searchDescription: "",
    };

    this.handleChange = handleChange.bind(this);
    this.fetchTasks = this.fetchTasks.bind(this);
    this.interval = window.setInterval(this.fetchTasks, 3000);
  }

  componentDidMount() {
    this.fetchTasks();
  }

  componentWillUnmount() {
    window.clearInterval(this.interval);
  }

  getUniqueKinds(tasks) {
    let o = {};

    for (const tsk of tasks) {
      o[tsk.kind] = true;
    }

    let result = [];
    for (const kind in o) {
      result.push(kind);
    }

    return result;
  }

  fetchTasks() {
    axios
      .get("/api/v1/tasks")
      .then((result) => {
        this.setState({
          items: result.data.tasks,
          uniqueKinds: this.getUniqueKinds(result.data.tasks),
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

  taskMatches(t) {
    if (this.state.showKind !== "All" && t.kind !== this.state.showKind) {
      return false;
    }

    if (this.state.showStatus !== "All" && t.status.toLowerCase() !== this.state.showStatus.toLowerCase()) {
      return false;
    }

    if (this.state.searchDescription && t.description.indexOf(this.state.searchDescription) < 0) {
      return false;
    }

    return true;
  }

  filterItems(items) {
    return items.filter((c) => this.taskMatches(c));
  }

  render() {
    const { items, isLoading, error } = this.state;
    if (error) {
      return <p>{error.message}</p>;
    }
    if (isLoading) {
      return <p>Loading ...</p>;
    }

    const columns = [
      {
        header: "Start Time",
        width: 160,
        cell: (x) => (
          <Link to={"/tasks/" + x.row.original.id} title={moment(x.row.original.startTime).toLocaleString()}>
            {moment(x.row.original.startTime).fromNow()}
          </Link>
        ),
      },
      {
        header: "Status",
        width: 240,
        cell: (x) => taskStatusSymbol(x.row.original),
      },
      {
        header: "Kind",
        width: "",
        cell: (x) => <span>{x.row.original.kind}</span>,
      },
      {
        header: "Description",
        width: "",
        cell: (x) => <span>{x.row.original.description}</span>,
      },
    ];

    const filteredItems = this.filterItems(items);
    const runningCount = items.filter((t) => t.status === "RUNNING").length;

    return (
      <div className="flex flex-col gap-4">
        <div>
          <Eyebrow>Tasks</Eyebrow>
          <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
            {runningCount} running
          </h1>
        </div>
        <Row className="items-end">
          <Col xs="auto">
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Status</Eyebrow>
              <Select
                className="py-[6px] text-[12px]"
                value={this.state.showStatus}
                onChange={(e) => this.setState({ showStatus: e.target.value })}
              >
                <option value="All">All</option>
                <option value="Running">Running</option>
                <option value="Failed">Failed</option>
              </Select>
            </label>
          </Col>
          <Col xs="auto">
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Kind</Eyebrow>
              <Select
                className="py-[6px] text-[12px]"
                value={this.state.showKind}
                onChange={(e) => this.setState({ showKind: e.target.value })}
              >
                <option value="All">All</option>
                {this.state.uniqueKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
          </Col>
          <Col>
            <label className="flex flex-col gap-[6px]">
              <Eyebrow>Search</Eyebrow>
              <Input
                type="text"
                name="searchDescription"
                placeholder="case-sensitive search description"
                value={this.state.searchDescription}
                onChange={this.handleChange}
                autoFocus={true}
              />
            </label>
          </Col>
        </Row>
        {!items.length ? (
          <Card>
            <span className="text-muted">
              <FontAwesomeIcon icon={faInfoCircle} /> A list of tasks will appear here when you create snapshots,
              restore, run maintenance, etc.
            </span>
          </Card>
        ) : (
          <KopiaTable data={filteredItems} columns={columns} />
        )}
      </div>
    );
  }
}
