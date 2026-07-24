// Admin Applications — prototype-style table for assigning applications to recruiters.
import { useState, useEffect } from 'react';
import { apiRequest, API_BASE } from '../../lib/api.js';
import { PageHeader, Card, Pill, DataTable, inputClass, btnSmClass, EmptyState } from '../../components/ui.jsx';

function AdminInternalApplicationsPage({ showToast }) {
  const [applications, setApplications] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadApplications() {
    setLoading(true);
    try {
      const data = await apiRequest('/api/admin/internal-applications');
      setApplications(data.applications || []);
      setRecruiters(data.recruiters || []);
    } catch (error) {
      showToast(error.message || 'Unable to load internal applications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();
  }, []);

  async function assignApplication(applicationId, recruiterId) {
    if (!recruiterId) return;
    try {
      await apiRequest(`/api/admin/internal-applications/${applicationId}/assign`, {
        method: 'PATCH',
        body: { recruiterId }
      });
      showToast('Application assigned successfully.');
      await loadApplications();
    } catch (error) {
      showToast(error.message || 'Unable to assign application.');
    }
  }

  return (
    <section>
      <PageHeader title="Applications" subtitle="Assign incoming applications to recruiters." />
      <Card title="Applications">
        <p className="mb-3.5 text-[13px] text-slate-500">
          Assign each incoming application to a recruiter. Once assigned, it appears in
          that recruiter's Assigned Applications.
        </p>
        {loading ? (
          <EmptyState text="Loading applications..." />
        ) : applications.length ? (
          <DataTable headers={['Candidate', 'Applied role', 'Resume', 'Status', 'Assign to recruiter']}>
            {applications.map((application) => (
              <tr key={application.id}>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] font-bold text-slate-900">
                  {application.candidate?.name || 'Candidate'}
                  <p className="text-xs font-normal text-slate-500">{application.candidate?.email || ''}</p>
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5 text-[13px] text-slate-600">
                  {application.title}
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  {application.candidate?.resumeDocumentId ? (
                    <button
                      className={btnSmClass}
                      onClick={() =>
                        window.open(
                          `${API_BASE}/api/documents/${application.candidate.resumeDocumentId}/download`,
                          '_blank'
                        )
                      }
                    >
                      Download
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">No resume</span>
                  )}
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <Pill tone={application.assignedRecruiterId ? 'violet' : 'amber'}>
                    {application.assignedRecruiterId ? 'Assigned' : 'Unassigned'}
                  </Pill>
                </td>
                <td className="border-t border-slate-200 px-2.5 py-2.5">
                  <select
                    value={application.assignedRecruiterId || ''}
                    onChange={(event) => assignApplication(application.id, event.target.value)}
                    className={`${inputClass} w-[190px]`}
                  >
                    <option value="">- Unassigned -</option>
                    {recruiters.map((recruiter) => (
                      <option key={recruiter.id} value={recruiter.id}>{recruiter.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState text="No internal Platform applications are waiting in the pipeline." />
        )}
      </Card>
    </section>
  );
}

export {
  AdminInternalApplicationsPage
};
