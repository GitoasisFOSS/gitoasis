// Copyright (c) 2023 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License.AGPL.txt in the project root for license information.

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gitpod-io/gitpod/common-go/log"
	"github.com/gitpod-io/gitpod/common-go/tracing"
	"github.com/opentracing/opentracing-go"

	"github.com/gitpod-io/gitpod/ws-daemon/pkg/internal/session"
)

type WorkspaceProvider struct {
	hooks    map[session.WorkspaceState][]session.WorkspaceLivecycleHook
	Location string
}

func NewWorkspaceProvider(hooks map[session.WorkspaceState][]session.WorkspaceLivecycleHook, location string) *WorkspaceProvider {
	return &WorkspaceProvider{
		hooks:    hooks,
		Location: location,
	}
}

func (wf *WorkspaceProvider) Create(ctx context.Context, instanceID, location string, create session.WorkspaceFactory) (ws *session.Workspace, err error) {
	span, ctx := opentracing.StartSpanFromContext(ctx, "Store.NewWorkspace")
	tracing.ApplyOWI(span, log.OWI("", "", instanceID))
	defer tracing.FinishSpan(span, &err)

	ws, err = create(ctx, location)
	if err != nil {
		return nil, err
	}

	err = wf.runLifecycleHooks(ctx, ws, session.WorkspaceInitializing)
	if err != nil {
		return nil, err
	}

	return nil, nil
}

func (wf *WorkspaceProvider) Get(ctx context.Context, instanceID string) (*session.Workspace, error) {
	path := filepath.Join(wf.Location, fmt.Sprintf("%s.workspace.json", instanceID))
	return loadWorkspace(ctx, path)
}

func (s *WorkspaceProvider) runLifecycleHooks(ctx context.Context, ws *session.Workspace, state session.WorkspaceState) error {
	hooks := s.hooks[state]
	log.WithFields(ws.OWI()).WithField("state", state).WithField("hooks", len(hooks)).Debug("running lifecycle hooks")

	for _, h := range hooks {
		err := h(ctx, ws)
		if err != nil {
			return err
		}
	}
	return nil
}

func loadWorkspace(ctx context.Context, path string) (ws *session.Workspace, err error) {
	span, _ := opentracing.StartSpanFromContext(ctx, "loadWorkspace")
	defer tracing.FinishSpan(span, &err)

	fc, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot load session file: %w", err)
	}

	err = json.Unmarshal(fc, ws)
	if err != nil {
		return nil, fmt.Errorf("cannot unmarshal session file: %w", err)
	}

	return ws, nil
}
