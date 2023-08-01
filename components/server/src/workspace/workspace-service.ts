/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { inject, injectable } from "inversify";
import { WorkspaceDB } from "@gitpod/gitpod-db/lib";
import { Project, User, Workspace, WorkspaceContext } from "@gitpod/gitpod-protocol";
import { ErrorCodes, ApplicationError } from "@gitpod/gitpod-protocol/lib/messaging/error";
import { Authorizer } from "../authorization/authorizer";
import { TraceContext } from "@gitpod/gitpod-protocol/lib/util/tracing";
import { WorkspaceFactory } from "./workspace-factory";
import { WorkspaceDeletionService } from "./workspace-deletion-service";

@injectable()
export class WorkspaceService {
    constructor(
        @inject(WorkspaceFactory) private readonly factory: WorkspaceFactory,
        @inject(WorkspaceDeletionService) private readonly workspaceDeletionService: WorkspaceDeletionService,
        @inject(WorkspaceDB) private readonly db: WorkspaceDB,
        @inject(Authorizer) private readonly auth: Authorizer,
    ) {}

    async createWorkspace(
        ctx: TraceContext,
        user: User,
        organizationId: string,
        project: Project | undefined,
        context: WorkspaceContext,
        normalizedContextURL: string,
    ): Promise<Workspace> {
        await this.auth.checkPermissionOnOrganization(user.id, "create_workspace", organizationId);

        // We don't want to be doing this in a transaction, because it calls out to external systems.
        // TODO(gpl) Would be great to sepearate workspace creation from external calls
        const workspace = await this.factory.createForContext(
            ctx,
            user,
            organizationId,
            project,
            context,
            normalizedContextURL,
        );

        // Instead, we fall back to removing access in case something goes wrong.
        try {
            await this.auth.createWorkspaceInOrg(organizationId, user.id, workspace.id);
        } catch (err) {
            await this.workspaceDeletionService.hardDeleteWorkspace(ctx, workspace.id);
            throw err;
        }

        return workspace;
    }

    async getWorkspace(userId: string, workspaceId: string): Promise<Workspace> {
        await this.auth.checkPermissionOnWorkspace(userId, "access", workspaceId);
        const workspace = await this.db.findById(workspaceId);
        if (!workspace) {
            throw new ApplicationError(ErrorCodes.NOT_FOUND, "Workspace not found.");
        }
        return workspace;
    }
}
