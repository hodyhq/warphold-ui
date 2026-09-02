import axios from "axios";
import React, { Component } from "react";
import { EmailNotificationMethod } from "./EmailNotificationMethod";
import { PushoverNotificationMethod } from "./PushoverNotificationMethod";
import { WebHookNotificationMethod } from "./WebHookNotificationMethod";

import { Button, Eyebrow, Pill } from "../../design/components";
import { Row } from "../Layout";
import { handleChange, stateProperty, valueToNumber } from "../../forms";
import { RequiredField } from "../../forms/RequiredField";
import { Control, FormField } from "../../forms/FormField";

const notificationMethods = {
  email: { displayName: "E-mail", editor: EmailNotificationMethod },
  pushover: { displayName: "Pushover", editor: PushoverNotificationMethod },
  webhook: { displayName: "Webhook", editor: WebHookNotificationMethod },
};

const severityOptions = [
  { value: -100, label: "Verbose" },
  { value: -10, label: "Success" },
  { value: 0, label: "Report" },
  { value: 10, label: "Warning" },
  { value: 20, label: "Error" },
];

function severityName(severity) {
  let opt = severityOptions.find((o) => o.value === severity);
  return opt ? opt.label : "Unknown";
}

export class NotificationEditor extends Component {
  constructor() {
    super();

    this.state = {
      notificationProfiles: [],
    };

    this.sendTestNotification = this.sendTestNotification.bind(this);
    this.optionsEditor = React.createRef();
    this.handleChange = handleChange.bind(this);
    this.saveNewProfile = this.saveNewProfile.bind(this);
    this.updateProfile = this.updateProfile.bind(this);
    this.deleteProfile = this.deleteProfile.bind(this);
    this.duplicateProfile = this.duplicateProfile.bind(this);
    this.fetchNotificationProfiles = this.fetchNotificationProfiles.bind(this);
  }

  setEditedProfile(profile, isNew) {
    this.setState({ editedProfile: profile, isNewProfile: isNew });
  }

  duplicateProfile(profile) {
    let newProfile = { ...profile };
    newProfile.profile = this.newProfileName(profile.method.type);
    this.setEditedProfile(newProfile, true);
  }

  editedConfig() {
    const ed = this.optionsEditor.current;
    if (!ed) {
      return null;
    }

    if (!ed.validate()) {
      alert("Invalid configuration, please correct the form fields");
      return null;
    }

    let cfg = { ...this.state.editedProfile };
    cfg.method.config = ed.state;
    return cfg;
  }

  saveNewProfile() {
    let cfg = this.editedConfig();
    if (!cfg) {
      return;
    }

    if (this.state.isNewProfile) {
      axios
        .post("/api/v1/notificationProfiles", cfg)
        .then((_result) => {
          this.setEditedProfile(null, false);
          this.fetchNotificationProfiles();
        })
        .catch((error) => {
          if (error.response.data.error) {
            alert("Error adding notification profile: " + error.response.data.error);
          }
        });
    }
  }

  updateProfile() {
    let cfg = this.editedConfig();
    if (!cfg) {
      return;
    }

    axios
      .post("/api/v1/notificationProfiles", cfg)
      .then((_result) => {
        this.setEditedProfile(null, false);
        this.fetchNotificationProfiles();
      })
      .catch((error) => {
        if (error.response.data.error) {
          alert("Error adding notification profile: " + error.response.data.error);
        }
      });
  }

  sendTestNotification(cfg) {
    if (this.state.editedProfile) {
      cfg = this.editedConfig();
      if (!cfg) {
        return;
      }
    }

    axios
      .post("/api/v1/testNotificationProfile", cfg)
      .then((_result) => {
        alert("Notification sent, please make sure you have received it.");
      })
      .catch((error) => {
        if (error.response.data.error) {
          alert("Error sending notification: " + error.response.data.error);
        }
      });
  }

  deleteProfile(profileName) {
    if (!window.confirm("Are you sure you want to delete the profile: " + profileName + "?")) {
      return;
    }

    axios
      .delete("/api/v1/notificationProfiles/" + profileName)
      .then((_result) => {
        this.fetchNotificationProfiles();
      })
      .catch((error) => {
        if (error.response.data.error) {
          alert("Error deleting: " + error.response.data.error);
        }
      });
  }

  fetchNotificationProfiles() {
    axios
      .get("/api/v1/notificationProfiles")
      .then((result) => {
        this.setState({
          notificationProfiles: result.data || [],
        });
      })
      .catch((_error) => {});
  }

  componentDidMount() {
    this.fetchNotificationProfiles();
  }

  candidateProfileName(type, index) {
    return type + "-" + index;
  }

  newProfileName(type) {
    let i = 1;

    while (true) {
      const name = this.candidateProfileName(type, i);

      if (!this.state.notificationProfiles.find((p) => name === p.profile)) {
        return name;
      }

      i++;
    }
  }

  renderEditor(SelectedEditor) {
    return (
      <div className="flex flex-col gap-4">
        <h4 className="font-display m-0 text-[20px] font-extrabold tracking-[-0.02em]">
          {this.state.isNewProfile ? "New Notification Profile" : "Edit Notification Profile"}
        </h4>
        <Row>
          {RequiredField(
            this,
            "Profile Name",
            "editedProfile.profile",
            {
              placeholder: "Enter profile name",
              readOnly: !this.state.isNewProfile,
            },
            "Unique name for this notification profile",
          )}
          <FormField
            label="Minimum Severity"
            required
            help="Minimum severity required to use this notification profile"
          >
            <Control
              as="select"
              name="editedProfile.minSeverity"
              onChange={(e) => this.handleChange(e, valueToNumber)}
              value={stateProperty(this, "editedProfile.minSeverity")}
            >
              {severityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Control>
          </FormField>
        </Row>
        <Row>
          <SelectedEditor ref={this.optionsEditor} initial={this.state.editedProfile.method.config} />
        </Row>
        <hr className="border-line" />
        <div className="flex flex-wrap items-center gap-3">
          {this.state.isNewProfile ? (
            <Button variant="primary" onClick={() => this.saveNewProfile()}>
              Create Profile
            </Button>
          ) : (
            <Button variant="primary" onClick={() => this.updateProfile()}>
              Update Profile
            </Button>
          )}
          <Button onClick={() => this.sendTestNotification(null)}>Send Test Notification</Button>
          <Button variant="danger" onClick={() => this.setEditedProfile(null, false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  renderList() {
    return (
      <div className="flex flex-col gap-4">
        {this.state.notificationProfiles && this.state.notificationProfiles.length > 0 ? (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line-strong text-left">
                <th className="px-2 py-[10px] font-normal">
                  <Eyebrow>Profile</Eyebrow>
                </th>
                <th className="px-2 py-[10px] font-normal">
                  <Eyebrow>Method</Eyebrow>
                </th>
                <th className="px-2 py-[10px] font-normal">
                  <Eyebrow>Minimum Severity</Eyebrow>
                </th>
                <th className="px-2 py-[10px] font-normal">
                  <Eyebrow>Actions</Eyebrow>
                </th>
              </tr>
            </thead>
            <tbody>
              {this.state.notificationProfiles.map((p) => (
                <tr key={p.profile} className="border-b border-line">
                  <td className="px-2 py-[10px] font-mono">{p.profile}</td>
                  <td className="px-2 py-[10px]">{notificationMethods[p.method.type].displayName}</td>
                  <td className="px-2 py-[10px]">{severityName(p.minSeverity)}</td>
                  <td className="flex flex-wrap gap-2 px-2 py-[10px]">
                    <Button onClick={() => this.setEditedProfile(p, false)}>Edit</Button>
                    <Button onClick={() => this.duplicateProfile(p)}>Duplicate</Button>
                    <Button onClick={() => this.sendTestNotification(p)}>Send Test Notification</Button>
                    <Button variant="danger" onClick={() => this.deleteProfile(p.profile)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 flex flex-wrap items-center gap-2 text-muted">
            <Pill tone="warn">Important</Pill>
            You don&apos;t have any notification profiles defined. Pick a method below to start receiving notifications.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {Object.keys(notificationMethods).map((k) => (
            <Button
              key={k}
              data-testid={"new-profile-" + k}
              onClick={() =>
                // create empty profile
                this.setEditedProfile(
                  {
                    profile: this.newProfileName(k),
                    method: { type: k, config: {} },
                    minSeverity: 0,
                  },
                  true,
                )
              }
            >
              New {notificationMethods[k].displayName} profile
            </Button>
          ))}
        </div>
      </div>
    );
  }

  render() {
    if (this.state.editedProfile) {
      return this.renderEditor(notificationMethods[this.state.editedProfile.method.type].editor);
    }

    return this.renderList();
  }
}
