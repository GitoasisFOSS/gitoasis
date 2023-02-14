/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import * as crypto from "crypto";
import { IDEFrontendDashboardService } from "@gitpod/gitpod-protocol/lib/frontend-dashboard-service";
import { RemoteTrackMessage } from "@gitpod/gitpod-protocol/lib/analytics";
import { Emitter } from "@gitpod/gitpod-protocol/lib/util/event";
import { workspaceUrl, serverUrl } from "./urls";

export class FrontendDashboardServiceClient implements IDEFrontendDashboardService.IClient {
    public latestStatus!: IDEFrontendDashboardService.Status;
    private credentialsToken?: Uint8Array;

    private readonly onDidChangeEmitter = new Emitter<IDEFrontendDashboardService.Status>();
    readonly onStatusUpdate = this.onDidChangeEmitter.event;

    private readonly onOpenBrowserIDEEmitter = new Emitter<void>();
    readonly onOpenBrowserIDE = this.onOpenBrowserIDEEmitter.event;

    private resolveInit!: () => void;
    private initPromise = new Promise<void>((resolve) => (this.resolveInit = resolve));

    private version?: number;

    constructor(private serverWindow: Window) {
        window.addEventListener("message", (event: MessageEvent) => {
            if (event.origin !== serverUrl.url.origin) {
                return;
            }
            if (IDEFrontendDashboardService.isStatusUpdateEventData(event.data)) {
                this.version = event.data.version;
                this.latestStatus = event.data.status;
                if (event.data.status.credentialsToken) {
                    this.credentialsToken = Uint8Array.from(atob(event.data.status.credentialsToken), (c) =>
                        c.charCodeAt(0),
                    );
                }
                this.resolveInit();
                this.onDidChangeEmitter.fire(this.latestStatus);
            }
            if (IDEFrontendDashboardService.isRelocateEventData(event.data)) {
                window.location.href = event.data.url;
            }
            if (IDEFrontendDashboardService.isOpenBrowserIDE(event.data)) {
                this.onOpenBrowserIDEEmitter.fire(undefined);
            }
        });
    }
    initialize(): Promise<void> {
        return this.initPromise;
    }

    decrypt(str: string): string {
        let obj = null;
        try {
            obj = JSON.parse(str);
            // if not maybe already save as plantext
            if (!isSerializedEncryptedData(obj)) {
                return str;
            }
        } catch (e) {
            return str;
        }
        if (!this.credentialsToken) {
            throw new Error("credentialsToken not found");
        }
        const data = {
            ...obj,
            iv: Buffer.from(obj.iv, "base64"),
            tag: Buffer.from(obj.tag, "base64"),
        };
        const decipher = crypto.createDecipheriv("aes-256-gcm", this.credentialsToken, data.iv);
        decipher.setAuthTag(data.tag);
        const decrypted = decipher.update(data.encrypted, "hex", "utf8");
        return decrypted + decipher.final("utf8");
    }

    encrypt(content: string): string {
        if (!this.credentialsToken) {
            throw new Error("credentialsToken not found");
        }
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", this.credentialsToken, iv);
        let encrypted = cipher.update(content, "utf8", "hex");
        encrypted += cipher.final("hex");
        const tag = cipher.getAuthTag();
        return JSON.stringify({
            iv: iv.toString("base64"),
            tag: tag.toString("base64"),
            encrypted,
        });
    }

    isEncryptedData(content: string): boolean {
        try {
            const obj = JSON.parse(content);
            return isSerializedEncryptedData(obj);
        } catch (e) {
            return false;
        }
    }

    trackEvent(msg: RemoteTrackMessage): void {
        const debugWorkspace = workspaceUrl.debugWorkspace;
        msg.properties = { ...msg.properties, debugWorkspace };
        this.serverWindow.postMessage(
            { type: "ide-track-event", msg } as IDEFrontendDashboardService.TrackEventData,
            serverUrl.url.origin,
        );
    }

    activeHeartbeat(): void {
        this.serverWindow.postMessage(
            { type: "ide-heartbeat" } as IDEFrontendDashboardService.HeartbeatEventData,
            serverUrl.url.origin,
        );
    }

    setState(state: IDEFrontendDashboardService.SetStateData): void {
        this.serverWindow.postMessage(
            { type: "ide-set-state", state } as IDEFrontendDashboardService.SetStateData,
            serverUrl.url.origin,
        );
    }

    // always perfrom redirect to dekstop IDE on gitpod origin
    // to avoid confirmation popup on each workspace origin
    openDesktopIDE(url: string): void {
        this.serverWindow.postMessage(
            { type: "ide-open-desktop", url } as IDEFrontendDashboardService.OpenDesktopIDE,
            serverUrl.url.origin,
        );
    }
}

function isSerializedEncryptedData(obj: any): obj is { iv: string; encrypted: string; tag: string } {
    return (
        obj != null &&
        typeof obj === "object" &&
        typeof obj.iv === "string" &&
        typeof obj.encrypted === "string" &&
        typeof obj.tag === "string"
    );
}
