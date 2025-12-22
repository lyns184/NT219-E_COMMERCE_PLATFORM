import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Heading,
  HStack,
  Icon,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Skeleton,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Textarea,
  useDisclosure,
  useToast,
  useColorModeValue,
  FormControl,
  FormErrorMessage,
  FormLabel,
  FormHelperText,
  VStack,
  Grid,
  GridItem,
  Divider,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Switch,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  List,
  ListItem,
  ListIcon,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  SimpleGrid
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, EditIcon, SearchIcon, CheckIcon, WarningIcon } from '@chakra-ui/icons';
import { FiPackage, FiImage, FiInfo, FiSettings, FiDollarSign, FiBox } from 'react-icons/fi';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AdminLayout } from '../../layouts/AdminLayout';
import { useApiErrorToast } from '../../hooks/useApiErrorToast';
import {
  useCreateProductMutation,
  useDeleteProductMutation,
  useProductsQuery,
  useUpdateProductMutation,
  useUploadPrototypeImageMutation
} from '../../features/products/queries';
import type { ProductDto } from '../../types/api';
import { formatCurrency } from '../../utils/currency';
import { resolveAssetUrl } from '../../utils/asset';

const productSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(10),
  price: z.number().positive(),
  currency: z.string().length(3),
  stock: z.number().int().min(0),
  isActive: z.boolean()
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  initialValues?: ProductDto;
  isSubmitting: boolean;
  isUploading: boolean;
  uploadProgress: number | null;
  prototypePreviewUrl?: string | null;
  existingPrototypeUrl?: string;
  onSelectPrototype: (file: File | null) => void;
}

const ProductFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialValues,
  isSubmitting,
  isUploading,
  uploadProgress,
  prototypePreviewUrl,
  existingPrototypeUrl,
  onSelectPrototype
}: ProductFormModalProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty }
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      currency: 'USD',
      stock: 0,
      isActive: true
    }
  });

  const formValues = watch();
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const bgAccent = useColorModeValue('gray.50', 'gray.900');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    if (initialValues) {
      reset({
        name: initialValues.name,
        description: initialValues.description,
        price: initialValues.price,
        currency: initialValues.currency.toUpperCase(),
        stock: initialValues.stock,
        isActive: initialValues.isActive
      });
    } else {
      reset({
        name: '',
        description: '',
        price: 0,
        currency: 'USD',
        stock: 0,
        isActive: true
      });
    }
    setActiveTab(0);
  }, [initialValues, reset, isOpen]);

  const submitHandler = async (values: ProductFormValues) => {
    await onSubmit({
      ...values,
      currency: values.currency.toUpperCase()
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    onSelectPrototype(file);
  };

  const handleClearPrototype = () => {
    onSelectPrototype(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const previewToDisplay = prototypePreviewUrl ?? existingPrototypeUrl ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent as="form" onSubmit={handleSubmit(submitHandler)} maxH="90vh">
        <ModalHeader borderBottom="1px" borderColor={borderColor}>
          <HStack spacing={3}>
            <Icon as={FiPackage} boxSize={6} color="brand.500" />
            <Box>
              <Heading size="md">
                {initialValues ? 'Update Product' : 'Create New Product'}
              </Heading>
              <Text fontSize="sm" fontWeight="normal" color="gray.500" mt={1}>
                {initialValues ? 'Edit product details and settings' : 'Add a new product to your store'}
              </Text>
            </Box>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={6} overflowY="auto">
          <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6} alignItems="start">
            {/* Main Form Section */}
            <GridItem>
              <Tabs index={activeTab} onChange={setActiveTab} colorScheme="brand">
                <TabList>
                  <Tab>
                    <Icon as={FiInfo} mr={2} />
                    Basic Info
                  </Tab>
                  <Tab>
                    <Icon as={FiDollarSign} mr={2} />
                    Pricing
                  </Tab>
                  <Tab>
                    <Icon as={FiBox} mr={2} />
                    Inventory
                  </Tab>
                  <Tab>
                    <Icon as={FiImage} mr={2} />
                    Media
                  </Tab>
                </TabList>

                <TabPanels>
                  {/* Basic Info Tab */}
                  <TabPanel px={0}>
                    <Stack spacing={6} mt={4}>
                      <FormControl isInvalid={Boolean(errors.name)} isRequired>
                        <FormLabel fontWeight="semibold">Product Name</FormLabel>
                        <Input
                          placeholder="e.g., Premium Wireless Headphones"
                          size="lg"
                          {...register('name')}
                        />
                        <FormHelperText>Choose a clear, descriptive name for your product</FormHelperText>
                        <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
                      </FormControl>

                      <FormControl isInvalid={Boolean(errors.description)} isRequired>
                        <FormLabel fontWeight="semibold">Description</FormLabel>
                        <Textarea
                          placeholder="Describe your product features, benefits, and specifications..."
                          rows={8}
                          size="lg"
                          {...register('description')}
                        />
                        <FormHelperText>
                          Provide detailed information about the product (minimum 10 characters)
                        </FormHelperText>
                        <FormErrorMessage>{errors.description?.message}</FormErrorMessage>
                      </FormControl>

                      <FormControl display="flex" alignItems="center">
                        <Box flex={1}>
                          <FormLabel mb={0} fontWeight="semibold">
                            Product Status
                          </FormLabel>
                          <Text fontSize="sm" color="gray.500">
                            Make this product visible in your store
                          </Text>
                        </Box>
                        <Controller
                          control={control}
                          name="isActive"
                          render={({ field }) => (
                            <Switch
                              size="lg"
                              colorScheme="brand"
                              isChecked={field.value}
                              onChange={field.onChange}
                            />
                          )}
                        />
                      </FormControl>
                    </Stack>
                  </TabPanel>

                  {/* Pricing Tab */}
                  <TabPanel px={0}>
                    <Stack spacing={6} mt={4}>
                      <Alert status="info" borderRadius="md">
                        <AlertIcon />
                        <Box>
                          <AlertTitle fontSize="sm">Pricing Information</AlertTitle>
                          <AlertDescription fontSize="xs">
                            Set competitive prices and choose the appropriate currency
                          </AlertDescription>
                        </Box>
                      </Alert>

                      <Grid templateColumns="2fr 1fr" gap={4}>
                        <FormControl isInvalid={Boolean(errors.price)} isRequired>
                          <FormLabel fontWeight="semibold">Price</FormLabel>
                          <Controller
                            control={control}
                            name="price"
                            render={({ field }) => (
                              <NumberInput
                                min={0}
                                precision={2}
                                step={0.01}
                                size="lg"
                                value={field.value}
                                onChange={(_, value) => field.onChange(value)}
                              >
                                <NumberInputField placeholder="0.00" />
                                <NumberInputStepper>
                                  <NumberIncrementStepper />
                                  <NumberDecrementStepper />
                                </NumberInputStepper>
                              </NumberInput>
                            )}
                          />
                          <FormErrorMessage>{errors.price?.message}</FormErrorMessage>
                        </FormControl>

                        <FormControl isInvalid={Boolean(errors.currency)} isRequired>
                          <FormLabel fontWeight="semibold">Currency</FormLabel>
                          <Select size="lg" {...register('currency')}>
                            <option value="USD">USD - US Dollar</option>
                            <option value="EUR">EUR - Euro</option>
                            <option value="GBP">GBP - British Pound</option>
                            <option value="JPY">JPY - Japanese Yen</option>
                            <option value="VND">VND - Vietnamese Dong</option>
                          </Select>
                          <FormErrorMessage>{errors.currency?.message}</FormErrorMessage>
                        </FormControl>
                      </Grid>

                      <Box p={4} bg={bgAccent} borderRadius="md" border="1px" borderColor={borderColor}>
                        <HStack justify="space-between">
                          <Box>
                            <Text fontSize="sm" color="gray.600" fontWeight="medium">
                              Price Preview
                            </Text>
                            <Text fontSize="2xl" fontWeight="bold" color="brand.500" mt={1}>
                              {formatCurrency(formValues.price || 0, formValues.currency || 'USD')}
                            </Text>
                          </Box>
                          <Icon as={FiDollarSign} boxSize={8} color="brand.300" />
                        </HStack>
                      </Box>
                    </Stack>
                  </TabPanel>

                  {/* Inventory Tab */}
                  <TabPanel px={0}>
                    <Stack spacing={6} mt={4}>
                      <Alert status="warning" borderRadius="md">
                        <AlertIcon />
                        <Box>
                          <AlertTitle fontSize="sm">Stock Management</AlertTitle>
                          <AlertDescription fontSize="xs">
                            Keep your inventory updated to avoid overselling
                          </AlertDescription>
                        </Box>
                      </Alert>

                      <FormControl isInvalid={Boolean(errors.stock)} isRequired>
                        <FormLabel fontWeight="semibold">Stock Quantity</FormLabel>
                        <Controller
                          control={control}
                          name="stock"
                          render={({ field }) => (
                            <NumberInput
                              min={0}
                              size="lg"
                              value={field.value}
                              onChange={(_, value) => field.onChange(value)}
                            >
                              <NumberInputField placeholder="0" />
                              <NumberInputStepper>
                                <NumberIncrementStepper />
                                <NumberDecrementStepper />
                              </NumberInputStepper>
                            </NumberInput>
                          )}
                        />
                        <FormHelperText>
                          Current number of units available for sale
                        </FormHelperText>
                        <FormErrorMessage>{errors.stock?.message}</FormErrorMessage>
                      </FormControl>

                      <Box p={4} bg={bgAccent} borderRadius="md" border="1px" borderColor={borderColor}>
                        <VStack align="stretch" spacing={3}>
                          <HStack justify="space-between">
                            <Text fontSize="sm" fontWeight="medium">Stock Status:</Text>
                            <Badge
                              colorScheme={
                                (formValues.stock || 0) > 20
                                  ? 'green'
                                  : (formValues.stock || 0) > 0
                                  ? 'yellow'
                                  : 'red'
                              }
                              fontSize="sm"
                              px={3}
                              py={1}
                            >
                              {(formValues.stock || 0) > 20
                                ? 'In Stock'
                                : (formValues.stock || 0) > 0
                                ? 'Low Stock'
                                : 'Out of Stock'}
                            </Badge>
                          </HStack>
                          <HStack justify="space-between">
                            <Text fontSize="sm" fontWeight="medium">Available Units:</Text>
                            <Text fontSize="lg" fontWeight="bold" color="brand.500">
                              {formValues.stock || 0}
                            </Text>
                          </HStack>
                        </VStack>
                      </Box>
                    </Stack>
                  </TabPanel>

                  {/* Media Tab */}
                  <TabPanel px={0}>
                    <Stack spacing={6} mt={4} maxH="calc(90vh - 300px)" overflowY="auto">
                      <FormControl>
                        <FormLabel fontWeight="semibold">Product Image</FormLabel>
                        <VStack spacing={4} align="stretch">
                          <Box
                            p={8}
                            border="2px dashed"
                            borderColor={borderColor}
                            borderRadius="lg"
                            textAlign="center"
                            bg={bgAccent}
                            position="relative"
                            cursor="pointer"
                            _hover={{ borderColor: 'brand.400', bg: useColorModeValue('brand.50', 'brand.900') }}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Input
                              ref={fileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={handleFileChange}
                              isDisabled={isUploading}
                              display="none"
                            />
                            <Icon as={FiImage} boxSize={12} color="gray.400" mb={3} />
                            <Text fontWeight="medium" mb={1}>
                              Click to upload product image
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                              PNG, JPG, WEBP or GIF (max 5 MB)
                            </Text>
                          </Box>

                          {previewToDisplay && (
                            <Card variant="outline">
                              <CardBody>
                                <VStack spacing={3}>
                                  <Box
                                    borderRadius="md"
                                    overflow="hidden"
                                    width="100%"
                                    minH="200px"
                                    maxH="350px"
                                    bg="gray.100"
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                    position="relative"
                                    cursor="pointer"
                                    _hover={{ opacity: 0.8 }}
                                    transition="opacity 0.2s"
                                    onClick={() => setIsLightboxOpen(true)}
                                    title="Click to view full size"
                                  >
                                    <Image
                                      src={previewToDisplay}
                                      alt="Product preview"
                                      objectFit="contain"
                                      maxW="100%"
                                      maxH="100%"
                                      height="auto"
                                      width="auto"
                                      pointerEvents="none"
                                    />
                                  </Box>
                                  <HStack justify="space-between" width="100%">
                                    <Badge colorScheme="green">
                                      {prototypePreviewUrl ? 'New Image Selected' : 'Current Image'}
                                    </Badge>
                                    {prototypePreviewUrl && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        colorScheme="red"
                                        onClick={handleClearPrototype}
                                        isDisabled={isUploading}
                                      >
                                        Remove
                                      </Button>
                                    )}
                                  </HStack>
                                </VStack>
                              </CardBody>
                            </Card>
                          )}

                          {typeof uploadProgress === 'number' && (
                            <Box>
                              <HStack justify="space-between" mb={2}>
                                <Text fontSize="sm" fontWeight="medium">Uploading...</Text>
                                <Text fontSize="sm" color="gray.500">{uploadProgress}%</Text>
                              </HStack>
                              <Progress
                                value={uploadProgress}
                                size="sm"
                                colorScheme="brand"
                                borderRadius="full"
                                hasStripe
                                isAnimated
                              />
                            </Box>
                          )}
                        </VStack>
                        <FormHelperText>
                          Upload a high-quality image to showcase your product
                        </FormHelperText>
                      </FormControl>
                    </Stack>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </GridItem>

            {/* Preview Sidebar */}
            <GridItem>
              <Card variant="outline" position="sticky" top={4}>
                <CardHeader bg={bgAccent} borderBottom="1px" borderColor={borderColor}>
                  <HStack>
                    <Icon as={FiSettings} color="gray.500" />
                    <Heading size="sm">Product Preview</Heading>
                  </HStack>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    <Box>
                      <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={2}>
                        PRODUCT NAME
                      </Text>
                      <Text fontWeight="bold" fontSize="lg" noOfLines={2}>
                        {formValues.name || 'Product name...'}
                      </Text>
                    </Box>

                    <Divider />

                    <Box>
                      <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={2}>
                        PRICE
                      </Text>
                      <Text fontSize="2xl" fontWeight="bold" color="brand.500">
                        {formatCurrency(formValues.price || 0, formValues.currency || 'USD')}
                      </Text>
                    </Box>

                    <Divider />

                    <Box>
                      <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={2}>
                        DESCRIPTION
                      </Text>
                      <Text fontSize="sm" noOfLines={4} color="gray.600">
                        {formValues.description || 'No description yet...'}
                      </Text>
                    </Box>

                    <Divider />

                    <SimpleGrid columns={2} spacing={3}>
                      <Box>
                        <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={1}>
                          STOCK
                        </Text>
                        <HStack>
                          <Icon
                            as={FiBox}
                            color={(formValues.stock || 0) > 0 ? 'green.500' : 'red.500'}
                          />
                          <Text fontWeight="semibold">{formValues.stock || 0}</Text>
                        </HStack>
                      </Box>
                      <Box>
                        <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={1}>
                          STATUS
                        </Text>
                        <Badge colorScheme={formValues.isActive ? 'green' : 'gray'}>
                          {formValues.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Box>
                    </SimpleGrid>

                    <Divider />

                    <Box>
                      <Text fontSize="xs" color="gray.500" fontWeight="medium" mb={2}>
                        VALIDATION
                      </Text>
                      <List spacing={2}>
                        <ListItem fontSize="sm">
                          <ListIcon
                            as={formValues.name && formValues.name.length >= 3 ? CheckIcon : WarningIcon}
                            color={formValues.name && formValues.name.length >= 3 ? 'green.500' : 'orange.500'}
                          />
                          Name (min 3 characters)
                        </ListItem>
                        <ListItem fontSize="sm">
                          <ListIcon
                            as={formValues.description && formValues.description.length >= 10 ? CheckIcon : WarningIcon}
                            color={formValues.description && formValues.description.length >= 10 ? 'green.500' : 'orange.500'}
                          />
                          Description (min 10 characters)
                        </ListItem>
                        <ListItem fontSize="sm">
                          <ListIcon
                            as={(formValues.price || 0) > 0 ? CheckIcon : WarningIcon}
                            color={(formValues.price || 0) > 0 ? 'green.500' : 'orange.500'}
                          />
                          Valid price
                        </ListItem>
                        <ListItem fontSize="sm">
                          <ListIcon
                            as={(formValues.stock || 0) >= 0 ? CheckIcon : WarningIcon}
                            color={(formValues.stock || 0) >= 0 ? 'green.500' : 'orange.500'}
                          />
                          Stock quantity
                        </ListItem>
                      </List>
                    </Box>
                  </VStack>
                </CardBody>
              </Card>
            </GridItem>
          </Grid>
        </ModalBody>

        <ModalFooter borderTop="1px" borderColor={borderColor} gap={3}>
          <Button onClick={onClose} variant="ghost" size="lg">
            Cancel
          </Button>
          <Button
            type="submit"
            colorScheme="brand"
            size="lg"
            isLoading={isSubmitting || isUploading}
            loadingText={isUploading ? 'Uploading...' : 'Saving...'}
            leftIcon={initialValues ? <EditIcon /> : <AddIcon />}
          >
            {initialValues ? 'Update Product' : 'Create Product'}
          </Button>
        </ModalFooter>
      </ModalContent>

      {/* Image Lightbox Modal */}
      <Modal isOpen={isLightboxOpen} onClose={() => setIsLightboxOpen(false)} size="full" isCentered>
        <ModalOverlay bg="blackAlpha.900" backdropFilter="blur(10px)" />
        <ModalContent bg="transparent" boxShadow="none" m={0}>
          <ModalCloseButton
            position="fixed"
            top={4}
            right={4}
            size="lg"
            color="white"
            bg="blackAlpha.600"
            _hover={{ bg: 'blackAlpha.800' }}
            zIndex={2}
          />
          <ModalBody
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={8}
            onClick={() => setIsLightboxOpen(false)}
          >
            <Image
              src={previewToDisplay ?? ''}
              alt="Full size preview"
              maxW="90vw"
              maxH="90vh"
              objectFit="contain"
              onClick={(e) => e.stopPropagation()}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Modal>
  );
};

export const AdminProductsPage = () => {
  const { data: products, isLoading } = useProductsQuery();
  const createProductMutation = useCreateProductMutation();
  const updateProductMutation = useUpdateProductMutation();
  const deleteProductMutation = useDeleteProductMutation();
  const uploadPrototypeMutation = useUploadPrototypeImageMutation();
  const toast = useToast();
  const toastError = useApiErrorToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingProduct, setEditingProduct] = useState<ProductDto | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [prototypeFile, setPrototypeFile] = useState<File | null>(null);
  const [prototypePreviewUrl, setPrototypePreviewUrl] = useState<string | null>(null);
  const [existingPrototypeUrl, setExistingPrototypeUrl] = useState<string | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (prototypePreviewUrl && prototypePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prototypePreviewUrl);
      }
    };
  }, [prototypePreviewUrl]);

  const resetPrototypeState = () => {
    setPrototypeFile(null);
    setUploadProgress(null);
    setExistingPrototypeUrl(undefined);
    setPrototypePreviewUrl(prev => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  };

  const handlePrototypeSelect = (file: File | null) => {
    setPrototypeFile(file);
    setUploadProgress(null);
    setPrototypePreviewUrl(prev => {
      if (prev && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      if (!file) {
        return null;
      }
      return URL.createObjectURL(file);
    });
  };

  const handleCloseModal = () => {
    resetPrototypeState();
    setEditingProduct(undefined);
    onClose();
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm.trim()) return products;
    const query = searchTerm.toLowerCase();
    return products.filter(product => product.name.toLowerCase().includes(query));
  }, [products, searchTerm]);

  const handleCreate = useCallback(() => {
    resetPrototypeState();
    setEditingProduct(undefined);
    onOpen();
  }, [onOpen, resetPrototypeState]);

  const handleEdit = useCallback((product: ProductDto) => {
    resetPrototypeState();
    setEditingProduct(product);
    setExistingPrototypeUrl(resolveAssetUrl(product.prototypeImageUrl ?? undefined));
    onOpen();
  }, [onOpen, resetPrototypeState]);

  const handleSubmit = async (values: ProductFormValues) => {
    try {
      let persistedProduct: ProductDto;

      if (editingProduct) {
        persistedProduct = await updateProductMutation.mutateAsync({ productId: editingProduct._id, payload: values });
      } else {
        persistedProduct = await createProductMutation.mutateAsync(values);
      }

      setEditingProduct(persistedProduct);
      setExistingPrototypeUrl(resolveAssetUrl(persistedProduct.prototypeImageUrl ?? undefined));

      if (prototypeFile) {
        setUploadProgress(0);
        const updatedProduct = await uploadPrototypeMutation.mutateAsync({
          productId: persistedProduct._id,
          file: prototypeFile,
          onUploadProgress: progress => setUploadProgress(progress)
        });
        persistedProduct = updatedProduct;
        setEditingProduct(updatedProduct);
        setExistingPrototypeUrl(resolveAssetUrl(updatedProduct.prototypeImageUrl ?? undefined));
      }

      toast({
        title: editingProduct ? 'Product updated' : 'Product created',
        status: 'success',
        duration: 3000,
        position: 'top'
      });

      handleCloseModal();
    } catch (error) {
      toastError(error, 'Failed to save product');
    }
  };

  const handleDelete = async (product: ProductDto) => {
    const confirmed = window.confirm(`Delete ${product.name}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteProductMutation.mutateAsync(product._id);
      toast({ title: 'Product deleted', status: 'success', duration: 3000, position: 'top' });
    } catch (error) {
      toastError(error, 'Failed to delete product');
    }
  };

  const isSubmitting =
    createProductMutation.isPending || updateProductMutation.isPending || uploadPrototypeMutation.isPending;

  const cardBg = useColorModeValue('white', 'gray.800');
  const textSecondary = useColorModeValue('gray.600', 'gray.400');

  return (
    <AdminLayout>
      <Stack spacing={8}>
        {/* Header */}
        <Box>
          <HStack justify="space-between" align="center" wrap="wrap" mb={4}>
            <HStack spacing={4}>
              <Icon as={FiPackage} boxSize={8} color="brand.500" />
              <Box>
                <Heading size="lg">Product Management</Heading>
                <Text color={textSecondary} mt={1}>
                  {filteredProducts.length} products found
                </Text>
              </Box>
            </HStack>
            <Button
              leftIcon={<AddIcon />}
              colorScheme="brand"
              size="lg"
              onClick={handleCreate}
            >
              New Product
            </Button>
          </HStack>
        </Box>

        {/* Search and Table */}
        <Card variant="elevated" bg={cardBg}>
          <CardHeader>
            <InputGroup maxW="md" size="lg">
              <InputLeftElement pointerEvents="none">
                <SearchIcon color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
              />
            </InputGroup>
          </CardHeader>
        <CardBody>
          {isLoading ? (
            <Stack spacing={3}>
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} height="48px" />
              ))}
            </Stack>
          ) : filteredProducts.length === 0 ? (
            <Box textAlign="center" py={12}>
              <Text color="gray.500">No products match your search.</Text>
            </Box>
          ) : (
            <Box overflowX="auto">
              <Table variant="simple" size="md">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th isNumeric>Price</Th>
                    <Th isNumeric>Stock</Th>
                    <Th>Status</Th>
                    <Th>Updated</Th>
                    <Th textAlign="right">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredProducts.map(product => (
                    <Tr key={product._id}>
                      <Td maxW="260px">
                        <Stack spacing={1}>
                          <Text fontWeight="medium">{product.name}</Text>
                          <Text color="gray.500" noOfLines={2}>
                            {product.description}
                          </Text>
                        </Stack>
                      </Td>
                      <Td isNumeric>{formatCurrency(product.price, product.currency)}</Td>
                      <Td isNumeric>{product.stock}</Td>
                      <Td>
                        <Badge
                          colorScheme={product.isActive ? 'green' : 'yellow'}
                          fontSize="sm"
                          px={3}
                          py={1}
                        >
                          {product.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      <Td>{new Date(product.updatedAt).toLocaleDateString()}</Td>
                      <Td textAlign="right">
                        <HStack justify="flex-end" spacing={2}>
                          <IconButton
                            aria-label="Edit product"
                            icon={<EditIcon />}
                            size="sm"
                            colorScheme="brand"
                            variant="ghost"
                            onClick={() => handleEdit(product)}
                          />
                          <IconButton
                            aria-label="Delete product"
                            icon={<DeleteIcon />}
                            size="sm"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => handleDelete(product)}
                            isLoading={deleteProductMutation.isPending}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      <ProductFormModal
        isOpen={isOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialValues={editingProduct}
        isSubmitting={isSubmitting}
        isUploading={uploadPrototypeMutation.isPending}
        uploadProgress={uploadProgress}
        prototypePreviewUrl={prototypePreviewUrl}
        existingPrototypeUrl={existingPrototypeUrl}
        onSelectPrototype={handlePrototypeSelect}
      />
      </Stack>
    </AdminLayout>
  );
};
