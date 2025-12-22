import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardBody,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Tag,
  Text,
  Select,
  Grid,
  GridItem,
  Stat,
  StatLabel,
  StatNumber,
  IconButton,
  Tooltip,
  Alert,
  AlertIcon,
  Spinner,
  HStack,
  VStack,
  Badge,
  Flex,
  Button,
  useToast
} from '@chakra-ui/react';
import { RepeatIcon, CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';

interface AuditLog {
  _id: string;
  timestamp: string;
  eventType: string;
  userId?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'partial';
  riskScore?: number;
  metadata?: {
    ip?: string;
    userAgent?: string;
    email?: string;
    [key: string]: any;
  };
  errorMessage?: string;
}

interface AuditStats {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  eventTypes: { [key: string]: number };
  avgRiskScore: number;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [limit] = useState(25);
  const toast = useToast();

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [minRiskScore, setMinRiskScore] = useState('');

  const eventTypes = [
    { value: '', label: 'All Events' },
    { value: 'auth.login', label: 'Login' },
    { value: 'auth.register', label: 'Registration' },
    { value: 'auth.logout', label: 'Logout' },
    { value: 'auth.email_verify', label: 'Email Verification' },
    { value: 'payment.initiated', label: 'Payment Initiated' },
    { value: 'payment.completed', label: 'Payment Completed' },
    { value: 'payment.failed', label: 'Payment Failed' },
    { value: 'order.created', label: 'Order Created' },
    { value: 'order.updated', label: 'Order Updated' },
    { value: 'security.failed_login', label: 'Failed Login' },
    { value: 'security.fraud_detected', label: 'Fraud Detected' }
  ];

  const fetchLogs = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams({
        limit: limit.toString(),
        skip: ((page - 1) * limit).toString()
      });

      if (eventTypeFilter) params.append('eventType', eventTypeFilter);
      if (resultFilter) params.append('result', resultFilter);
      if (minRiskScore) params.append('minRiskScore', minRiskScore);

      if (import.meta.env.DEV) {
        console.log('Fetching audit logs:', `/admin/audit-logs?${params}`);
      }
      const response = await apiClient.get(`/admin/audit-logs?${params}`);
      if (import.meta.env.DEV) {
        console.log('Audit logs response:', response.data);
      }
      
      setLogs(response.data.data.logs);
      setTotalLogs(response.data.data.total);
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('Audit logs fetch error:', err);
        console.error('Error response:', err.response);
      }
      toast({
        title: 'Error fetching logs',
        description: err.response?.data?.message || err.message || 'Failed to fetch audit logs',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      if (import.meta.env.DEV) {
        console.log('Fetching audit stats');
      }
      const response = await apiClient.get('/admin/audit-stats');
      if (import.meta.env.DEV) {
        console.log('Stats response:', response.data);
      }
      setStats(response.data.data);
    } catch (err: any) {
      if (import.meta.env.DEV) {
        console.error('Failed to fetch stats:', err);
        console.error('Stats error response:', err.response);
      }
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, eventTypeFilter, resultFilter, minRiskScore]);

  useEffect(() => {
    fetchStats();
  }, []);

  const getRiskScoreColor = (score?: number): string => {
    if (!score) return 'gray';
    if (score < 30) return 'green';
    if (score < 60) return 'yellow';
    if (score < 80) return 'orange';
    return 'red';
  };

  const getResultColor = (result: string): string => {
    switch (result) {
      case 'success': return 'green';
      case 'failure': return 'red';
      default: return 'yellow';
    }
  };

  const totalPages = Math.ceil(totalLogs / limit);

  return (
    <Box p={6}>
      <Flex justifyContent="space-between" alignItems="center" mb={6}>
        <Heading size="lg">Audit Logs</Heading>
        <Tooltip label="Refresh">
          <IconButton
            aria-label="Refresh"
            icon={<RepeatIcon />}
            onClick={() => { fetchLogs(); fetchStats(); }}
            colorScheme="blue"
          />
        </Tooltip>
      </Flex>

      {/* Statistics Cards */}
      {stats && (
        <Grid templateColumns="repeat(4, 1fr)" gap={4} mb={6}>
          <GridItem>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Total Events</StatLabel>
                  <StatNumber>{stats.totalEvents.toLocaleString()}</StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Success Rate</StatLabel>
                  <StatNumber color="green.500">
                    {stats.totalEvents > 0
                      ? Math.round((stats.successCount / stats.totalEvents) * 100)
                      : 0}%
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Failed Events</StatLabel>
                  <StatNumber color="red.500">
                    {stats.failureCount.toLocaleString()}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Avg Risk Score</StatLabel>
                  <StatNumber>
                    {stats.avgRiskScore?.toFixed(1) || 'N/A'}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      )}

      {/* Filters */}
      <Card mb={4}>
        <CardBody>
          <Grid templateColumns="repeat(3, 1fr)" gap={4}>
            <GridItem>
              <Text mb={2} fontSize="sm" fontWeight="medium">Event Type</Text>
              <Select
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                {eventTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </GridItem>
            <GridItem>
              <Text mb={2} fontSize="sm" fontWeight="medium">Result</Text>
              <Select
                value={resultFilter}
                onChange={(e) => {
                  setResultFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Results</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="partial">Partial</option>
              </Select>
            </GridItem>
            <GridItem>
              <Text mb={2} fontSize="sm" fontWeight="medium">Min Risk Score</Text>
              <Select
                value={minRiskScore}
                onChange={(e) => {
                  setMinRiskScore(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Scores</option>
                <option value="30">Low (30+)</option>
                <option value="60">High (60+)</option>
                <option value="80">Critical (80+)</option>
              </Select>
            </GridItem>
          </Grid>
        </CardBody>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardBody>
          {loading ? (
            <Flex justify="center" align="center" py={8}>
              <Spinner size="xl" />
            </Flex>
          ) : logs.length === 0 ? (
            <Alert status="info">
              <AlertIcon />
              No audit logs found
            </Alert>
          ) : (
            <>
              <TableContainer>
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Timestamp</Th>
                      <Th>Event Type</Th>
                      <Th>Action</Th>
                      <Th>Resource</Th>
                      <Th>Result</Th>
                      <Th>Risk Score</Th>
                      <Th>IP Address</Th>
                      <Th>User</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {logs.map((log) => (
                      <Tr key={log._id}>
                        <Td>
                          <VStack align="start" spacing={0}>
                            <Text fontSize="sm">
                              {dayjs(log.timestamp).format('MMM DD, YYYY')}
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                              {dayjs(log.timestamp).format('HH:mm:ss')}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Tag size="sm" variant="outline">
                            {log.eventType}
                          </Tag>
                        </Td>
                        <Td>{log.action}</Td>
                        <Td>{log.resource}</Td>
                        <Td>
                          <HStack spacing={2}>
                            {log.result === 'success' && <CheckCircleIcon color="green.500" />}
                            {log.result === 'failure' && <WarningIcon color="red.500" />}
                            <Badge colorScheme={getResultColor(log.result)}>
                              {log.result}
                            </Badge>
                          </HStack>
                        </Td>
                        <Td>
                          {log.riskScore !== undefined ? (
                            <Badge colorScheme={getRiskScoreColor(log.riskScore)}>
                              {log.riskScore}
                            </Badge>
                          ) : (
                            <Text color="gray.400">-</Text>
                          )}
                        </Td>
                        <Td>
                          <Text fontFamily="mono" fontSize="xs">
                            {log.metadata?.ip || '-'}
                          </Text>
                        </Td>
                        <Td>
                          {log.userId ? (
                            <Tooltip label={log.userId}>
                              <Text fontFamily="mono" fontSize="xs">
                                {log.userId.substring(0, 8)}...
                              </Text>
                            </Tooltip>
                          ) : (
                            <Text color="gray.400">-</Text>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Flex mt={4} justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalLogs)} of {totalLogs} logs
                </Text>
                <HStack>
                  <Button
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    isDisabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Text fontSize="sm">
                    Page {page} of {totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    isDisabled={page === totalPages}
                  >
                    Next
                  </Button>
                </HStack>
              </Flex>
            </>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}
