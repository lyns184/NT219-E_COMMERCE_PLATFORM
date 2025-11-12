import {
  Badge,
  Box,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Icon,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  Select,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  useDisclosure,
  VStack,
  IconButton,
  useToast
} from '@chakra-ui/react';
import { FiClipboard, FiEye, FiEdit2 } from 'react-icons/fi';
import { useState } from 'react';
import dayjs from 'dayjs';
import { AdminLayout } from '../../layouts/AdminLayout';
import { useAdminOrdersQuery } from '../../features/orders/queries';
import { formatCurrency } from '../../utils/currency';
import { apiClient } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';

export const AdminOrdersPage = () => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const queryClient = useQueryClient();
  const toast = useToast();
  
  const { data: orders, isLoading, isError } = useAdminOrdersQuery();

  const cardBg = useColorModeValue('white', 'gray.800');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  const filteredOrders = orders?.filter(order => 
    statusFilter === 'all' || order.status === statusFilter
  );

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiClient.patch(`/orders/${orderId}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast({
        title: 'Order status updated',
        status: 'success',
        duration: 3000,
        position: 'top'
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to update status',
        status: 'error',
        duration: 3000,
        position: 'top'
      });
    }
  };

  const openStatusModal = (orderId: string) => {
    setSelectedOrderId(orderId);
    onOpen();
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <Stack align="center" py={16} spacing={4}>
          <Spinner size="lg" />
          <Text>Loading recent orders...</Text>
        </Stack>
      </AdminLayout>
    );
  }

  if (isError) {
    return (
      <AdminLayout>
        <Box textAlign="center" py={16}>
          <Heading size="md" mb={2}>
            Unable to load orders
          </Heading>
          <Text color="gray.500">Please try again shortly.</Text>
        </Box>
      </AdminLayout>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <AdminLayout>
        <Box textAlign="center" py={16}>
          <Heading size="md" mb={2}>
            No orders yet
          </Heading>
          <Text color="gray.500">Orders will appear here once customers start checking out.</Text>
        </Box>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Stack spacing={8}>
        {/* Header */}
        <Box>
          <HStack spacing={4} mb={4}>
            <Icon as={FiClipboard} boxSize={8} color="brand.500" />
            <Box>
              <Heading size="lg">Order Management</Heading>
              <Text color={textSecondary} mt={1}>
                {filteredOrders?.length || 0} orders found
              </Text>
            </Box>
          </HStack>
        </Box>

        {/* Orders Table */}
        <Card variant="elevated" bg={cardBg}>
          <CardHeader>
            <HStack justify="space-between">
              <Text color={textSecondary} fontSize="lg">
                Track customer orders and payment statuses in real time.
              </Text>
              <Select maxW="200px" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </HStack>
          </CardHeader>
          <CardBody>
            <Box overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>Order ID</Th>
                    <Th>User</Th>
                    <Th>Status</Th>
                    <Th isNumeric>Total</Th>
                    <Th>Created</Th>
                    <Th>Payment Intent</Th>
                    <Th textAlign="right">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredOrders?.map(order => {
                    // Safely get user email, handle null/undefined cases
                    let userEmail = 'Unknown User';
                    if (order.user) {
                      if (typeof order.user === 'string') {
                        userEmail = order.user;
                      } else if (order.user.email) {
                        userEmail = order.user.email;
                      } else if (order.user._id) {
                        userEmail = order.user._id;
                      }
                    }
                    
                    return (
                      <Tr key={order._id}>
                        <Td fontFamily="mono" fontSize="sm">{order._id}</Td>
                        <Td>{userEmail}</Td>
                        <Td>
                          <Badge
                            colorScheme={
                              order.status === 'paid' ? 'green' : 
                              order.status === 'shipped' ? 'blue' :
                              order.status === 'cancelled' ? 'red' : 'yellow'
                            }
                            fontSize="sm"
                            px={3}
                            py={1}
                          >
                            {order.status}
                          </Badge>
                        </Td>
                        <Td isNumeric fontWeight="semibold">
                          {formatCurrency(order.totalAmount, order.currency)}
                        </Td>
                        <Td>{dayjs(order.createdAt).format('MMM D, YYYY h:mm A')}</Td>
                        <Td fontFamily="mono" fontSize="sm">{order.paymentIntentId ?? 'N/A'}</Td>
                        <Td textAlign="right">
                          <IconButton
                            aria-label="Update status"
                            icon={<FiEdit2 />}
                            size="sm"
                            variant="ghost"
                            colorScheme="blue"
                            onClick={() => openStatusModal(order._id)}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </Box>
          </CardBody>
        </Card>
      </Stack>

      {/* Update Status Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Update Order Status</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3}>
              <Button w="full" onClick={() => handleUpdateStatus(selectedOrderId!, 'pending')}>
                Pending
              </Button>
              <Button w="full" onClick={() => handleUpdateStatus(selectedOrderId!, 'processing')}>
                Processing
              </Button>
              <Button w="full" colorScheme="green" onClick={() => handleUpdateStatus(selectedOrderId!, 'paid')}>
                Paid
              </Button>
              <Button w="full" colorScheme="blue" onClick={() => handleUpdateStatus(selectedOrderId!, 'shipped')}>
                Shipped
              </Button>
              <Button w="full" colorScheme="red" onClick={() => handleUpdateStatus(selectedOrderId!, 'cancelled')}>
                Cancelled
              </Button>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
