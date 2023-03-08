/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { Organization, OrgMemberInfo, User } from "@gitpod/gitpod-protocol";
import { BillingMode } from "@gitpod/gitpod-protocol/lib/billing-mode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext } from "react";
import { useLocation } from "react-router";
import { publicApiTeamMembersToProtocol, publicApiTeamToProtocol, teamsService } from "../../service/public-api";
import { getGitpodService } from "../../service/service";
import { useCurrentUser, UserContext } from "../../user-context";
import { getUserBillingModeQueryKey } from "../billing-mode/user-billing-mode-query";

export interface OrganizationInfo extends Organization {
    members: OrgMemberInfo[];
    billingMode?: BillingMode;
    isOwner: boolean;
    invitationId?: string;
}

export function useOrganizationsInvalidator() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    return useCallback(() => {
        console.log("Invalidating orgs... " + JSON.stringify(getQueryKey(user)));
        queryClient.invalidateQueries(getQueryKey(user));
    }, [user, queryClient]);
}

export function useOrganizations() {
    const user = useCurrentUser();
    const queryClient = useQueryClient();
    const { refreshUserBillingMode } = useContext(UserContext);
    const query = useQuery<OrganizationInfo[], Error>(
        getQueryKey(user),
        async () => {
            console.log("Fetching orgs... " + JSON.stringify(getQueryKey(user)));
            const response = await teamsService.listTeams({});
            const result: OrganizationInfo[] = [];
            for (const org of response.teams) {
                const billingMode = await getGitpodService().server.getBillingModeForTeam(org.id);
                const members = publicApiTeamMembersToProtocol(org.members || []);
                const isOwner = members.some((m) => m.role === "owner" && m.userId === user?.id);
                result.push({
                    ...publicApiTeamToProtocol(org),
                    members,
                    billingMode,
                    isOwner,
                    invitationId: org.teamInvitation?.id,
                });
            }
            return result;
        },
        {
            onSuccess: (data) => {
                if (!user) {
                    return;
                }
                // refresh user billing mode to update the billing mode in the user context as it depends on the orgs
                refreshUserBillingMode();
                queryClient.invalidateQueries(getUserBillingModeQueryKey(user.id));
            },
            enabled: !!user,
            cacheTime: 1000 * 60 * 60 * 1, // 1 hour
            staleTime: 1000 * 60 * 60 * 1, // 1 hour
        },
    );
    return query;
}

function getQueryKey(user?: User) {
    return ["organizations", user?.id];
}

// Custom hook to return the current org if one is selected
export function useCurrentOrg(): { data?: OrganizationInfo; isLoading: boolean } {
    const location = useLocation();
    const orgs = useOrganizations();
    const user = useCurrentUser();

    if (orgs.isLoading || !orgs.data || !user) {
        return { data: undefined, isLoading: true };
    }
    let orgId = localStorage.getItem("active-org");
    const orgIdParam = new URLSearchParams(location.search).get("org");
    if (orgIdParam) {
        orgId = orgIdParam;
    }
    let org = orgs.data.find((org) => org.id === orgId);
    if (!org && user?.additionalData?.isMigratedToTeamOnlyAttribution) {
        // if the user is migrated to team-only attribution, we return the first org
        org = orgs.data[0];
    }
    if (org) {
        localStorage.setItem("active-org", org.id);
    } else if (orgId && (orgs.isLoading || orgs.isStale)) {
        // orgs are still fetching, but we have an orgId
        localStorage.setItem("active-org", orgId);
    } else {
        localStorage.removeItem("active-org");
    }
    return { data: org, isLoading: false };
}