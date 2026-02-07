// styles/common.ts
import { BaseColors } from '@/constants/colors';
import { StyleSheet } from 'react-native';

export const commonStyles = StyleSheet.create({
    // Header styles
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: BaseColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: BaseColors.border,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: BaseColors.text.dark,
        marginLeft: 12,
    },

    // Screen header styles
    screenHeader: {
        marginBottom: 24,
    },
    screenHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    screenTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: BaseColors.text.dark,
        marginLeft: 12,
    },
    screenSubtitle: {
        fontSize: 16,
        color: BaseColors.text.light,
        marginTop: 8,
        marginLeft: 40,
    },
});