"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/export-csv";
import { listMembers, type MemberRow } from "@/lib/actions/admin";

export function MembersPanel() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMembers()
      .then((res) => {
        if (res.ok) setRows(res.members);
        else toast.error(res.error);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <div className="p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Members</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} member${rows.length === 1 ? "" : "s"}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                `members-${new Date().toISOString().slice(0, 10)}.csv`,
                rows.map((m) => ({
                  name: m.client_name,
                  phone: m.phone,
                  purchased: m.start_date,
                  activates: m.activation_date ?? "",
                  expires: m.expires_at,
                  status: m.status,
                  amount: m.amount_paid,
                })),
              )
            }
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Purchased</TableHead>
              <TableHead>Activates</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  No members yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.client_name}</TableCell>
                <TableCell>{m.phone}</TableCell>
                <TableCell>{format(new Date(m.start_date), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  {m.activation_date ? format(new Date(m.activation_date), "dd MMM yyyy") : "—"}
                </TableCell>
                <TableCell>{format(new Date(m.expires_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  {m.status === "active" ? (
                    <Badge className="bg-emerald-600 text-white">Active</Badge>
                  ) : m.status === "pending" ? (
                    <Badge variant="outline">Pending activation</Badge>
                  ) : (
                    <Badge variant="destructive">Expired</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
