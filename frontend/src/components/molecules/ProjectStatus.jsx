import { Badge } from "../atoms/Badge";

import { labels } from "../../utils/projects";

export function ProjectStatus({ status }) {
  return <Badge variant={status}>{labels[status]}</Badge>;
}
